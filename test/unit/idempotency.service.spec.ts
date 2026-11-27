import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdempotencyStatus } from '@prisma/client';
import {
  IdempotencyConflictException,
  IdempotencyPayloadMismatchException,
} from '../../src/common/exceptions/idempotency.exceptions';
import { FingerprintService } from '../../src/idempotency/fingerprint.service';
import { IdempotencyRepository } from '../../src/idempotency/idempotency.repository';
import { IdempotencyService } from '../../src/idempotency/idempotency.service';
import { RedisService } from '../../src/redis/redis.service';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let repository: jest.Mocked<IdempotencyRepository>;
  let redisService: jest.Mocked<RedisService>;
  let fingerprintService: FingerprintService;

  const payload = {
    amount: 5000,
    currency: 'PKR',
    customerReference: 'customer-101',
  };

  beforeEach(() => {
    const configService = {
      get: jest.fn((_k: string, d: number) => d),
    } as unknown as ConfigService;

    fingerprintService = new FingerprintService(configService);
    repository = {
      findByKey: jest.fn(),
      tryAcquireLock: jest.fn(),
      tryAcquireExpiredLease: jest.fn(),
      tryReclaimExpiredRecord: jest.fn(),
      linkPayment: jest.fn(),
      releaseLease: jest.fn(),
      markCompleted: jest.fn(),
    } as unknown as jest.Mocked<IdempotencyRepository>;

    redisService = {
      getJson: jest.fn().mockResolvedValue(null),
      setJson: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RedisService>;

    service = new IdempotencyService(
      repository,
      fingerprintService,
      redisService,
      configService,
    );
  });

  it('returns cached response from Redis without hitting PostgreSQL', async () => {
    const hash = fingerprintService.generateFingerprint(payload);
    redisService.getJson.mockResolvedValue({
      requestHash: hash,
      statusCode: 201,
      body: { id: 'pay-1', status: 'SUCCEEDED' },
    });

    const handler = jest.fn();
    const result = await service.execute({
      rawKey: 'key-1',
      fingerprintPayload: payload,
      handler,
    });

    expect(result).toEqual({
      statusCode: 201,
      body: { id: 'pay-1', status: 'SUCCEEDED' },
      replayed: true,
    });
    expect(handler).not.toHaveBeenCalled();
    expect(jest.spyOn(repository, 'tryAcquireLock')).not.toHaveBeenCalled();
  });

  it('throws 422 when Redis cached fingerprint mismatches', async () => {
    redisService.getJson.mockResolvedValue({
      requestHash: 'different-hash',
      statusCode: 201,
      body: { id: 'pay-1' },
    });

    await expect(
      service.execute({
        rawKey: 'key-1',
        fingerprintPayload: payload,
        handler: jest.fn(),
      }),
    ).rejects.toThrow(IdempotencyPayloadMismatchException);
  });

  it('throws 409 Conflict when another request holds an active PROCESSING lease', async () => {
    const hash = fingerprintService.generateFingerprint(payload);
    repository.tryAcquireLock.mockResolvedValue({ acquired: false });
    repository.findByKey.mockResolvedValue({
      id: 'rec-1',
      key: 'key-1',
      requestHash: hash,
      status: IdempotencyStatus.PROCESSING,
      responseStatusCode: null,
      responseBody: null,
      paymentId: 'pay-1',
      leaseExpiresAt: new Date(Date.now() + 20000),
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      service.execute({
        rawKey: 'key-1',
        fingerprintPayload: payload,
        handler: jest.fn(),
      }),
    ).rejects.toThrow(IdempotencyConflictException);
  });

  it('recovers an expired PROCESSING lease and passes isRecovery=true', async () => {
    const hash = fingerprintService.generateFingerprint(payload);
    repository.tryAcquireLock.mockResolvedValue({ acquired: false });
    repository.findByKey.mockResolvedValue({
      id: 'rec-1',
      key: 'key-1',
      requestHash: hash,
      status: IdempotencyStatus.PROCESSING,
      responseStatusCode: null,
      responseBody: null,
      paymentId: 'pay-1',
      leaseExpiresAt: new Date(Date.now() - 5000),
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    repository.tryAcquireExpiredLease.mockResolvedValue(true);

    const handler = jest.fn().mockResolvedValue({
      statusCode: HttpStatus.CREATED,
      body: { id: 'pay-1', status: 'SUCCEEDED' },
      paymentId: 'pay-1',
    });

    const result = await service.execute({
      rawKey: 'key-1',
      fingerprintPayload: payload,
      handler,
    });

    expect(handler).toHaveBeenCalledWith({
      key: 'key-1',
      existingPaymentId: 'pay-1',
      isRecovery: true,
    });
    expect(result.replayed).toBe(false);
    expect(jest.spyOn(repository, 'markCompleted')).toHaveBeenCalled();
  });
});
