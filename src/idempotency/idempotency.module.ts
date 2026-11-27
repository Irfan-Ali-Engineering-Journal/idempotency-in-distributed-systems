import { Module } from '@nestjs/common';
import { FingerprintService } from './fingerprint.service';
import { IdempotencyController } from './idempotency.controller';
import { IdempotencyRepository } from './idempotency.repository';
import { IdempotencyService } from './idempotency.service';

@Module({
  controllers: [IdempotencyController],
  providers: [FingerprintService, IdempotencyRepository, IdempotencyService],
  exports: [IdempotencyService, FingerprintService, IdempotencyRepository],
})
export class IdempotencyModule {}
