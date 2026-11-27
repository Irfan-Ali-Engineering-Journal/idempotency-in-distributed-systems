import { Injectable } from '@nestjs/common';
import {
  PaymentProviderSimulator,
  ProviderChargeRequest,
  ProviderChargeResult,
} from './payment-provider.simulator';

@Injectable()
export class PaymentProviderService {
  constructor(private readonly simulator: PaymentProviderSimulator) {}

  async processPayment(
    request: ProviderChargeRequest,
  ): Promise<ProviderChargeResult> {
    return this.simulator.charge(request);
  }
}
