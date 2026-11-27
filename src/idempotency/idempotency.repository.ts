import { Injectable } from '@nestjs/common';
import { IdempotencyRecord, IdempotencyStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class IdempotencyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByKey(key: string): Promise<IdempotencyRecord | null> {
    return this.prisma.idempotencyRecord.findUnique({
      where: { key },
    });
  }

  async tryAcquireLock(params: {
    key: string;
    requestHash: string;
    leaseExpiresAt: Date;
    expiresAt: Date;
  }): Promise<
    { acquired: true; record: IdempotencyRecord } | { acquired: false }
  > {
    try {
      const record = await this.prisma.idempotencyRecord.create({
        data: {
          key: params.key,
          requestHash: params.requestHash,
          status: IdempotencyStatus.PROCESSING,
          leaseExpiresAt: params.leaseExpiresAt,
          expiresAt: params.expiresAt,
        },
      });
      return { acquired: true, record };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { acquired: false };
      }
      throw error;
    }
  }

  async tryAcquireExpiredLease(
    key: string,
    now: Date,
    newLeaseExpiresAt: Date,
  ): Promise<boolean> {
    const result = await this.prisma.idempotencyRecord.updateMany({
      where: {
        key,
        status: IdempotencyStatus.PROCESSING,
        leaseExpiresAt: { lte: now },
      },
      data: {
        leaseExpiresAt: newLeaseExpiresAt,
      },
    });
    return result.count === 1;
  }

  async tryReclaimExpiredRecord(params: {
    key: string;
    now: Date;
    requestHash: string;
    leaseExpiresAt: Date;
    expiresAt: Date;
  }): Promise<boolean> {
    const result = await this.prisma.idempotencyRecord.updateMany({
      where: {
        key: params.key,
        expiresAt: { lte: params.now },
      },
      data: {
        requestHash: params.requestHash,
        status: IdempotencyStatus.PROCESSING,
        responseStatusCode: null,
        responseBody: Prisma.JsonNull,
        paymentId: null,
        leaseExpiresAt: params.leaseExpiresAt,
        expiresAt: params.expiresAt,
      },
    });
    return result.count === 1;
  }

  async linkPayment(key: string, paymentId: string): Promise<void> {
    await this.prisma.idempotencyRecord.update({
      where: { key },
      data: { paymentId },
    });
  }

  async releaseLease(key: string): Promise<void> {
    await this.prisma.idempotencyRecord.updateMany({
      where: { key, status: IdempotencyStatus.PROCESSING },
      data: { leaseExpiresAt: new Date() },
    });
  }

  async markCompleted(
    key: string,
    statusCode: number,
    responseBody: Prisma.InputJsonValue,
    paymentId?: string,
  ): Promise<IdempotencyRecord> {
    return this.prisma.idempotencyRecord.update({
      where: { key },
      data: {
        status: IdempotencyStatus.COMPLETED,
        responseStatusCode: statusCode,
        responseBody,
        paymentId: paymentId ?? undefined,
        leaseExpiresAt: null,
      },
    });
  }
}
