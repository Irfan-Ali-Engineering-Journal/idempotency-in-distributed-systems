import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  ProviderTransaction,
  ProviderTransactionStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export type SimulateBehavior =
  'success' | 'fail' | 'delay' | 'timeout' | 'crash_after_provider';

export interface ProviderChargeRequest {
  providerIdempotencyKey: string;
  paymentId: string;
  amount: number;
  currency: string;
  simulateBehavior?: SimulateBehavior;
}

export interface ProviderChargeResult {
  providerTransactionId: string;
  status: ProviderTransactionStatus;
  amount: string;
  currency: string;
  deduplicated: boolean;
}

@Injectable()
export class PaymentProviderSimulator {
  private readonly logger = new Logger(PaymentProviderSimulator.name);
  private readonly defaultDelayMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.defaultDelayMs = this.configService.get<number>(
      'provider.simulatedDelayMs',
      50,
    );
  }

  async charge(request: ProviderChargeRequest): Promise<ProviderChargeResult> {
    const {
      providerIdempotencyKey,
      paymentId,
      amount,
      currency,
      simulateBehavior = 'success',
    } = request;

    // 1. Check downstream idempotency store first
    const existing = await this.prisma.providerTransaction.findUnique({
      where: { providerIdempotencyKey },
    });

    if (existing) {
      this.logger.log(
        `Provider deduplication hit for key "${providerIdempotencyKey}" -> tx=${existing.id}`,
      );
      return {
        providerTransactionId: existing.id,
        status: existing.status,
        amount: existing.amount.toFixed(2),
        currency: existing.currency,
        deduplicated: true,
      };
    }

    // 2. Simulate external gateway network latency
    const delayMs =
      simulateBehavior === 'delay'
        ? Math.max(this.defaultDelayMs, 500)
        : this.defaultDelayMs;
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // 3. Determine provider outcome
    const txStatus: ProviderTransactionStatus =
      simulateBehavior === 'fail'
        ? ProviderTransactionStatus.FAILED
        : ProviderTransactionStatus.SUCCEEDED;

    // 4. Persist provider transaction atomically using unique providerIdempotencyKey
    let record: ProviderTransaction;
    let deduplicated = false;
    try {
      record = await this.prisma.providerTransaction.create({
        data: {
          providerIdempotencyKey,
          paymentId,
          amount: new Prisma.Decimal(amount.toFixed(2)),
          currency: currency.toUpperCase(),
          status: txStatus,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        record = await this.prisma.providerTransaction.findUniqueOrThrow({
          where: { providerIdempotencyKey },
        });
        deduplicated = true;
      } else {
        throw error;
      }
    }

    // 5. Simulate post-provider failures (timeout before response / worker crash)
    if (simulateBehavior === 'timeout') {
      this.logger.warn(
        `Simulating gateway timeout AFTER provider executed tx=${record.id} for key "${providerIdempotencyKey}"`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.GATEWAY_TIMEOUT,
          error: 'Gateway Timeout',
          code: 'PROVIDER_RESPONSE_TIMEOUT',
          message:
            'The payment provider timed out before returning a response. Please retry with the same Idempotency-Key.',
        },
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }

    if (simulateBehavior === 'crash_after_provider') {
      this.logger.error(
        `Simulating worker crash AFTER provider executed tx=${record.id} for key "${providerIdempotencyKey}"`,
      );
      throw new Error('SIMULATED_WORKER_CRASH_AFTER_PROVIDER');
    }

    return {
      providerTransactionId: record.id,
      status: record.status,
      amount: record.amount.toFixed(2),
      currency: record.currency,
      deduplicated,
    };
  }
}
