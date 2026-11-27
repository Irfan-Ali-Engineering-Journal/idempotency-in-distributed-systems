import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { PaymentProviderModule } from '../payment-provider/payment-provider.module';
import { PaymentsController } from './payments.controller';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

@Module({
  imports: [IdempotencyModule, PaymentProviderModule],
  controllers: [PaymentsController],
  providers: [PaymentsRepository, PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
