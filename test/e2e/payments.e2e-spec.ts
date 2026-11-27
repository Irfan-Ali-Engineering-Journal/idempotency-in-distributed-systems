import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { GlobalHttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { PrismaService } from '../../src/database/prisma.service';
import { RedisService } from '../../src/redis/redis.service';

interface PaymentBody {
  id: string;
  amount: string;
  currency: string;
  status: string;
  providerTransactionId: string | null;
}

interface ErrorBody {
  code?: string;
  status?: string;
}

describe('Idempotent Payments (e2e)', () => {
  let app: INestApplication;
  let httpServer: App;
  let prisma: PrismaService;
  let redis: RedisService;

  const basePayload = {
    amount: 5000,
    currency: 'PKR',
    customerReference: 'customer-101',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new GlobalHttpExceptionFilter());

    await app.init();
    httpServer = app.getHttpServer() as App;
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
  });

  beforeEach(async () => {
    await prisma.providerTransaction.deleteMany();
    await prisma.idempotencyRecord.deleteMany();
    await prisma.payment.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('1 & 2. First payment creates one transaction; duplicate request replays original response', async () => {
    const key = 'e2e-first-dup-1';
    await redis.del(key);

    const first = await request(httpServer)
      .post('/api/v1/payments')
      .set('Idempotency-Key', key)
      .send(basePayload)
      .expect(201);

    const firstBody = first.body as PaymentBody;
    expect(first.headers['idempotency-replayed']).toBe('false');
    expect(firstBody.status).toBe('SUCCEEDED');
    expect(firstBody.providerTransactionId).toBeTruthy();

    const second = await request(httpServer)
      .post('/api/v1/payments')
      .set('Idempotency-Key', key)
      .send(basePayload)
      .expect(201);

    const secondBody = second.body as PaymentBody;
    expect(second.headers['idempotency-replayed']).toBe('true');
    expect(secondBody.id).toBe(firstBody.id);
    expect(secondBody.providerTransactionId).toBe(
      firstBody.providerTransactionId,
    );

    const paymentCount = await prisma.payment.count();
    const providerTxCount = await prisma.providerTransaction.count();
    expect(paymentCount).toBe(1);
    expect(providerTxCount).toBe(1);
  });

  it('3. Reusing same key with different payload returns 422 Unprocessable Entity', async () => {
    const key = 'e2e-mismatch-1';
    await redis.del(key);

    await request(httpServer)
      .post('/api/v1/payments')
      .set('Idempotency-Key', key)
      .send(basePayload)
      .expect(201);

    const mismatch = await request(httpServer)
      .post('/api/v1/payments')
      .set('Idempotency-Key', key)
      .send({ ...basePayload, amount: 10000 })
      .expect(422);

    const mismatchBody = mismatch.body as ErrorBody;
    expect(mismatchBody.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
  });

  it('4. 12 concurrent requests with the same key produce exactly one provider transaction', async () => {
    const key = 'e2e-concurrent-12';
    await redis.del(key);

    const requests = Array.from({ length: 12 }, () =>
      request(httpServer)
        .post('/api/v1/payments')
        .set('Idempotency-Key', key)
        .set('X-Simulate-Behavior', 'delay')
        .send(basePayload),
    );

    const responses = await Promise.all(requests);
    const created = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);

    expect(created.length).toBeGreaterThanOrEqual(1);
    expect(created.length + conflicts.length).toBe(12);

    const providerTxCount = await prisma.providerTransaction.count({
      where: { providerIdempotencyKey: key },
    });
    expect(providerTxCount).toBe(1);
  });

  it('5. Provider failure is persisted and replayed idempotently', async () => {
    const key = 'e2e-fail-1';
    await redis.del(key);

    const first = await request(httpServer)
      .post('/api/v1/payments')
      .set('Idempotency-Key', key)
      .set('X-Simulate-Behavior', 'fail')
      .send(basePayload)
      .expect(201);

    const firstBody = first.body as PaymentBody;
    expect(firstBody.status).toBe('FAILED');

    const retry = await request(httpServer)
      .post('/api/v1/payments')
      .set('Idempotency-Key', key)
      .send(basePayload)
      .expect(201);

    const retryBody = retry.body as PaymentBody;
    expect(retry.headers['idempotency-replayed']).toBe('true');
    expect(retryBody.id).toBe(firstBody.id);
    expect(retryBody.status).toBe('FAILED');
  });

  it('6. Client timeout after provider execution recovers without duplicate charge on retry', async () => {
    const key = 'e2e-timeout-1';
    await redis.del(key);

    await request(httpServer)
      .post('/api/v1/payments')
      .set('Idempotency-Key', key)
      .set('X-Simulate-Behavior', 'timeout')
      .send(basePayload)
      .expect(504);

    const retry = await request(httpServer)
      .post('/api/v1/payments')
      .set('Idempotency-Key', key)
      .send(basePayload)
      .expect(201);

    const retryBody = retry.body as PaymentBody;
    expect(retryBody.status).toBe('SUCCEEDED');
    const providerTxCount = await prisma.providerTransaction.count({
      where: { providerIdempotencyKey: key },
    });
    expect(providerTxCount).toBe(1);
  });

  it('7. Application crash recovery via expired processing lease avoids duplicate charge', async () => {
    const key = 'e2e-crash-1';
    await redis.del(key);

    await request(httpServer)
      .post('/api/v1/payments')
      .set('Idempotency-Key', key)
      .set('X-Simulate-Behavior', 'crash_after_provider')
      .send(basePayload)
      .expect(500);

    // Expire the lease to simulate worker lease timeout after crash
    await prisma.idempotencyRecord.update({
      where: { key },
      data: { leaseExpiresAt: new Date(Date.now() - 1000) },
    });

    const recovered = await request(httpServer)
      .post('/api/v1/payments')
      .set('Idempotency-Key', key)
      .send(basePayload)
      .expect(201);

    const recoveredBody = recovered.body as PaymentBody;
    expect(recoveredBody.status).toBe('SUCCEEDED');
    const providerTxCount = await prisma.providerTransaction.count({
      where: { providerIdempotencyKey: key },
    });
    expect(providerTxCount).toBe(1);
  });

  it('8. Redis unavailable does not break idempotency guarantees', async () => {
    const key = 'e2e-redis-down-1';
    const getSpy = jest.spyOn(redis, 'getJson').mockResolvedValue(null);
    const setSpy = jest.spyOn(redis, 'setJson').mockResolvedValue(undefined);
    const healthSpy = jest.spyOn(redis, 'isHealthy').mockResolvedValue(false);

    try {
      const readyRes = await request(httpServer)
        .get('/health/ready')
        .expect(200);
      expect((readyRes.body as ErrorBody).status).toBe('degraded');

      const first = await request(httpServer)
        .post('/api/v1/payments')
        .set('Idempotency-Key', key)
        .send(basePayload)
        .expect(201);

      const second = await request(httpServer)
        .post('/api/v1/payments')
        .set('Idempotency-Key', key)
        .send(basePayload)
        .expect(201);

      expect((second.body as PaymentBody).id).toBe(
        (first.body as PaymentBody).id,
      );
      expect(second.headers['idempotency-replayed']).toBe('true');
    } finally {
      getSpy.mockRestore();
      setSpy.mockRestore();
      healthSpy.mockRestore();
    }
  });

  it('9. PostgreSQL unavailable causes /health/ready to return 503 while /health/live stays 200', async () => {
    const pgSpy = jest.spyOn(prisma, 'isHealthy').mockResolvedValue(false);

    try {
      await request(httpServer).get('/health/live').expect(200);
      const readyRes = await request(httpServer)
        .get('/health/ready')
        .expect(503);
      expect((readyRes.body as ErrorBody).status).toBe('not_ready');
    } finally {
      pgSpy.mockRestore();
    }
  });

  it('10. Expired idempotency record is reclaimed for a new payment', async () => {
    const key = 'e2e-expired-1';
    await redis.del(key);

    const first = await request(httpServer)
      .post('/api/v1/payments')
      .set('Idempotency-Key', key)
      .send(basePayload)
      .expect(201);

    // Force record expiration in DB and clear Redis
    await prisma.idempotencyRecord.update({
      where: { key },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await redis.del(key);

    const second = await request(httpServer)
      .post('/api/v1/payments')
      .set('Idempotency-Key', key)
      .send({ ...basePayload, amount: 9000 })
      .expect(201);

    const firstBody = first.body as PaymentBody;
    const secondBody = second.body as PaymentBody;
    expect(secondBody.id).not.toBe(firstBody.id);
    expect(secondBody.amount).toBe('9000.00');
  });
});
