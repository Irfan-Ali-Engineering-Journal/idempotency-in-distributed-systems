import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { IdempotencyStatus } from '@prisma/client';
import configuration from '../../src/config/configuration';
import { envValidationSchema } from '../../src/config/env.validation';
import { DatabaseModule } from '../../src/database/database.module';
import { PrismaService } from '../../src/database/prisma.service';
import { IdempotencyModule } from '../../src/idempotency/idempotency.module';
import { IdempotencyRepository } from '../../src/idempotency/idempotency.repository';
import { PaymentProviderModule } from '../../src/payment-provider/payment-provider.module';
import { PaymentProviderSimulator } from '../../src/payment-provider/payment-provider.simulator';
import { RedisModule } from '../../src/redis/redis.module';
import { RedisService } from '../../src/redis/redis.service';

describe('Idempotency Persistence (Integration)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let idempotencyRepo: IdempotencyRepository;
  let redisService: RedisService;
  let simulator: PaymentProviderSimulator;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
          validationSchema: envValidationSchema,
        }),
        DatabaseModule,
        RedisModule,
        IdempotencyModule,
        PaymentProviderModule,
      ],
    }).compile();

    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    idempotencyRepo = moduleRef.get(IdempotencyRepository);
    redisService = moduleRef.get(RedisService);
    simulator = moduleRef.get(PaymentProviderSimulator);
  });

  beforeEach(async () => {
    await prisma.providerTransaction.deleteMany();
    await prisma.idempotencyRecord.deleteMany();
    await prisma.payment.deleteMany();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('enforces unique idempotency key constraint on concurrent lock acquisitions', async () => {
    const now = new Date();
    const lease = new Date(now.getTime() + 30000);
    const expires = new Date(now.getTime() + 86400000);

    const results = await Promise.all([
      idempotencyRepo.tryAcquireLock({
        key: 'int-lock-1',
        requestHash: 'hash-a',
        leaseExpiresAt: lease,
        expiresAt: expires,
      }),
      idempotencyRepo.tryAcquireLock({
        key: 'int-lock-1',
        requestHash: 'hash-a',
        leaseExpiresAt: lease,
        expiresAt: expires,
      }),
      idempotencyRepo.tryAcquireLock({
        key: 'int-lock-1',
        requestHash: 'hash-a',
        leaseExpiresAt: lease,
        expiresAt: expires,
      }),
    ]);

    const acquiredCount = results.filter((r) => r.acquired).length;
    expect(acquiredCount).toBe(1);
  });

  it('recovers expired lease atomically using optimistic update', async () => {
    const past = new Date(Date.now() - 10000);
    const future = new Date(Date.now() + 86400000);

    await idempotencyRepo.tryAcquireLock({
      key: 'int-lease-1',
      requestHash: 'hash-b',
      leaseExpiresAt: past,
      expiresAt: future,
    });

    const now = new Date();
    const newLease = new Date(now.getTime() + 30000);

    const [win1, win2] = await Promise.all([
      idempotencyRepo.tryAcquireExpiredLease('int-lease-1', now, newLease),
      idempotencyRepo.tryAcquireExpiredLease('int-lease-1', now, newLease),
    ]);

    expect([win1, win2].filter(Boolean)).toHaveLength(1);
  });

  it('caches and retrieves JSON values in Redis', async () => {
    await redisService.setJson(
      'int-cache-1',
      { status: IdempotencyStatus.COMPLETED },
      60,
    );
    const cached = await redisService.getJson<{ status: string }>(
      'int-cache-1',
    );
    expect(cached).toEqual({ status: IdempotencyStatus.COMPLETED });
    await redisService.del('int-cache-1');
  });

  it('prevents duplicate ProviderTransaction records via unique providerIdempotencyKey', async () => {
    const paymentId = '11111111-1111-4111-8111-111111111111';
    const [tx1, tx2] = await Promise.all([
      simulator.charge({
        providerIdempotencyKey: 'int-prov-1',
        paymentId,
        amount: 2500,
        currency: 'PKR',
      }),
      simulator.charge({
        providerIdempotencyKey: 'int-prov-1',
        paymentId,
        amount: 2500,
        currency: 'PKR',
      }),
    ]);

    expect(tx1.providerTransactionId).toBe(tx2.providerTransactionId);
    const count = await prisma.providerTransaction.count({
      where: { providerIdempotencyKey: 'int-prov-1' },
    });
    expect(count).toBe(1);
  });
});
