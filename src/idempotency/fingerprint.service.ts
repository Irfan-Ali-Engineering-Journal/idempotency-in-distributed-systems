import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InvalidIdempotencyKeyException,
  MissingIdempotencyKeyException,
} from '../common/exceptions/idempotency.exceptions';
import { computeRequestFingerprint } from '../common/utils/canonical-json';

const SAFE_KEY_PATTERN = /^[a-zA-Z0-9._:-]+$/;

@Injectable()
export class FingerprintService {
  private readonly maxKeyLength: number;

  constructor(private readonly configService: ConfigService) {
    this.maxKeyLength = this.configService.get<number>(
      'idempotency.maxKeyLength',
      255,
    );
  }

  validateKey(rawKey: string | undefined): string {
    if (!rawKey || rawKey.trim().length === 0) {
      throw new MissingIdempotencyKeyException();
    }

    const key = rawKey.trim();
    if (key.length > this.maxKeyLength) {
      throw new InvalidIdempotencyKeyException(
        `Idempotency-Key exceeds maximum length of ${this.maxKeyLength} characters.`,
      );
    }

    if (!SAFE_KEY_PATTERN.test(key)) {
      throw new InvalidIdempotencyKeyException(
        'Idempotency-Key may only contain alphanumeric characters, dots, underscores, colons, and hyphens.',
      );
    }

    return key;
  }

  generateFingerprint(payload: {
    amount: number;
    currency: string;
    customerReference: string;
  }): string {
    return computeRequestFingerprint({
      amount: Number(payload.amount.toFixed(2)),
      currency: payload.currency.trim().toUpperCase(),
      customerReference: payload.customerReference.trim(),
    });
  }
}
