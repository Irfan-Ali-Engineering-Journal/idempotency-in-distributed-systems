import { ConfigService } from '@nestjs/config';
import {
  InvalidIdempotencyKeyException,
  MissingIdempotencyKeyException,
} from '../../src/common/exceptions/idempotency.exceptions';
import { FingerprintService } from '../../src/idempotency/fingerprint.service';

describe('FingerprintService', () => {
  let service: FingerprintService;

  beforeEach(() => {
    const configService = {
      get: jest.fn((_key: string, defaultVal: number) => defaultVal),
    } as unknown as ConfigService;
    service = new FingerprintService(configService);
  });

  describe('validateKey', () => {
    it('throws MissingIdempotencyKeyException when key is undefined or blank', () => {
      expect(() => service.validateKey(undefined)).toThrow(
        MissingIdempotencyKeyException,
      );
      expect(() => service.validateKey('   ')).toThrow(
        MissingIdempotencyKeyException,
      );
    });

    it('throws InvalidIdempotencyKeyException when key exceeds max length', () => {
      const longKey = 'a'.repeat(256);
      expect(() => service.validateKey(longKey)).toThrow(
        InvalidIdempotencyKeyException,
      );
    });

    it('throws InvalidIdempotencyKeyException for unsafe characters', () => {
      expect(() => service.validateKey('invalid key with spaces')).toThrow(
        InvalidIdempotencyKeyException,
      );
      expect(() => service.validateKey('key/with/slashes')).toThrow(
        InvalidIdempotencyKeyException,
      );
    });

    it('trims and returns valid idempotency keys', () => {
      expect(service.validateKey('  payment-order-1001  ')).toBe(
        'payment-order-1001',
      );
      expect(service.validateKey('ord_123:456.789')).toBe('ord_123:456.789');
    });
  });

  describe('generateFingerprint', () => {
    it('produces identical SHA-256 hashes for normalized equivalent payloads', () => {
      const hash1 = service.generateFingerprint({
        amount: 5000,
        currency: 'pkr',
        customerReference: 'customer-101',
      });
      const hash2 = service.generateFingerprint({
        amount: 5000.0,
        currency: 'PKR',
        customerReference: ' customer-101 ',
      });

      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);
    });

    it('produces different hashes when business fields differ', () => {
      const hash1 = service.generateFingerprint({
        amount: 5000,
        currency: 'PKR',
        customerReference: 'customer-101',
      });
      const hash2 = service.generateFingerprint({
        amount: 10000,
        currency: 'PKR',
        customerReference: 'customer-101',
      });

      expect(hash1).not.toBe(hash2);
    });
  });
});
