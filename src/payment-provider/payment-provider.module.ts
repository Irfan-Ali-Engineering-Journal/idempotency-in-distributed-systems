import { Module } from '@nestjs/common';
import { PaymentProviderService } from './payment-provider.service';
import { PaymentProviderSimulator } from './payment-provider.simulator';

@Module({
  providers: [PaymentProviderSimulator, PaymentProviderService],
  exports: [PaymentProviderService],
})
export class PaymentProviderModule {}
