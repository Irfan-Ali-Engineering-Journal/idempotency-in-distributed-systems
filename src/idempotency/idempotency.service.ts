import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdempotencyStatus, Prisma } from '@prisma/client';
import {
  IdempotencyConflictException,
  IdempotencyPayloadMismatchException,
} from '../common/exceptions/idempotency.exceptions';
import { RedisService } from '../redis/redis.service';
import { FingerprintService } from './fingerprint.service';
import { IdempotencyRepository } from './idempotency.repository';

interface CachedIdempotencyResponse<T = unknown> {
  requestHash: string;
  statusCode: number;
  body: T;
}

export interface IdempotentExecutionContext {
  key: string;
  existingPaymentId?: string;
  isRecovery: boolean;
}

export interface IdempotentExecutionResult<T> {
  statusCode: number;
  body: T;
  replayed: boolean;
}

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly ttlSeconds: number;
  private readonly leaseDurationMs: number;
  private readonly cacheTtlSeconds: number;

  constructor(
    private readonly repository: IdempotencyRepository,
    private readonly fingerprintService: FingerprintService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.ttlSeconds = this.configService.get<number>(
      'idempotency.ttlSeconds',
      86400,
    );
    this.leaseDurationMs = this.configService.get<number>(
      'idempotency.leaseDurationMs',
      30000,
    );
    this.cacheTtlSeconds = this.configService.get<number>(
      'redis.cacheTtlSeconds',
      3600,
    );
  }

  async execute<T extends Record<string, unknown>>(params: {
    rawKey: string | undefined;
    fingerprintPayload: {
      amount: number;
      currency: string;
      customerReference: string;
    };
    handler: (
      ctx: IdempotentExecutionContext,
    ) => Promise<{ statusCode: number; body: T; paymentId: string }>;
  }): Promise<IdempotentExecutionResult<T>> {
    const key = this.fingerprintService.validateKey(params.rawKey);
    const requestHash = this.fingerprintService.generateFingerprint(
      params.fingerprintPayload,
    );

    // 1. Fast-path: check Redis cache for completed response
    const cached =
      await this.redisService.getJson<CachedIdempotencyResponse<T>>(key);
    if (cached) {
      if (cached.requestHash !== requestHash) {
        throw new IdempotencyPayloadMismatchException(key);
      }
      this.logger.debug(`Idempotency Redis cache hit for key "${key}"`);
      return {
        statusCode: cached.statusCode,
        body: cached.body,
        replayed: true,
      };
    }

    // 2. Authoritative check & atomic lock acquisition in PostgreSQL
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + this.leaseDurationMs);
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);

    let isRecovery = false;
    let existingPaymentId: string | undefined;

    const lockResult = await this.repository.tryAcquireLock({
      key,
      requestHash,
      leaseExpiresAt,
      expiresAt,
    });

    if (!lockResult.acquired) {
      const existing = await this.repository.findByKey(key);
      if (!existing) {
        throw new IdempotencyConflictException(key);
      }

      // Check if existing record has expired past retention TTL
      if (existing.expiresAt <= now) {
        const reclaimed = await this.repository.tryReclaimExpiredRecord({
          key,
          now,
          requestHash,
          leaseExpiresAt,
          expiresAt,
        });
        if (!reclaimed) {
          throw new IdempotencyConflictException(key);
        }
        await this.redisService.del(key);
        this.logger.log(
          `Reclaimed expired idempotency record for key "${key}"`,
        );
      } else {
        // Record is still active: verify payload fingerprint
        if (existing.requestHash !== requestHash) {
          throw new IdempotencyPayloadMismatchException(key);
        }

        if (
          existing.status === IdempotencyStatus.COMPLETED ||
          existing.status === IdempotencyStatus.FAILED
        ) {
          const statusCode = existing.responseStatusCode ?? HttpStatus.OK;
          const body = existing.responseBody as T;

          // Backfill Redis cache (best effort)
          await this.redisService.setJson<CachedIdempotencyResponse<T>>(
            key,
            { requestHash, statusCode, body },
            this.computeRemainingCacheTtl(existing.expiresAt),
          );

          return {
            statusCode,
            body,
            replayed: true,
          };
        }

        // Status is PROCESSING: check if lease has expired
        const leaseExpired =
          existing.leaseExpiresAt !== null && existing.leaseExpiresAt <= now;

        if (!leaseExpired) {
          throw new IdempotencyConflictException(key);
        }

        const recovered = await this.repository.tryAcquireExpiredLease(
          key,
          now,
          leaseExpiresAt,
        );
        if (!recovered) {
          throw new IdempotencyConflictException(key);
        }

        isRecovery = true;
        existingPaymentId = existing.paymentId ?? undefined;
        this.logger.warn(
          `Acquired expired processing lease for key "${key}" (paymentId=${existingPaymentId ?? 'none'})`,
        );
      }
    }

    // 3. Execute business handler outside of any long-running DB transaction
    try {
      const result = await params.handler({
        key,
        existingPaymentId,
        isRecovery,
      });

      await this.repository.markCompleted(
        key,
        result.statusCode,
        result.body as unknown as Prisma.InputJsonValue,
        result.paymentId,
      );

      await this.redisService.setJson<CachedIdempotencyResponse<T>>(
        key,
        {
          requestHash,
          statusCode: result.statusCode,
          body: result.body,
        },
        Math.min(this.cacheTtlSeconds, this.ttlSeconds),
      );

      return {
        statusCode: result.statusCode,
        body: result.body,
        replayed: false,
      };
    } catch (error) {
      // On gateway timeout, release the lease immediately so the client can retry right away
      // and recover the downstream provider transaction without waiting for lease expiration.
      if (
        error instanceof HttpException &&
        error.getStatus() === (HttpStatus.GATEWAY_TIMEOUT as number)
      ) {
        await this.repository.releaseLease(key);
      }
      throw error;
    }
  }

  async linkPayment(key: string, paymentId: string): Promise<void> {
    await this.repository.linkPayment(key, paymentId);
  }

  async getStatus(key: string) {
    const validatedKey = this.fingerprintService.validateKey(key);
    const record = await this.repository.findByKey(validatedKey);
    if (!record) {
      throw new NotFoundException(
        `Idempotency record for key "${validatedKey}" not found.`,
      );
    }

    return {
      key: record.key,
      status: record.status,
      paymentId: record.paymentId,
      responseStatusCode: record.responseStatusCode,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private computeRemainingCacheTtl(expiresAt: Date): number {
    const remainingSeconds = Math.floor(
      (expiresAt.getTime() - Date.now()) / 1000,
    );
    return Math.max(1, Math.min(this.cacheTtlSeconds, remainingSeconds));
  }
}
