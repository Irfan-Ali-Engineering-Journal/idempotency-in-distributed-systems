import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Payment,
  PaymentStatus,
  ProviderTransactionStatus,
} from '@prisma/client';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { PaymentProviderService } from '../payment-provider/payment-provider.service';
import { SimulateBehavior } from '../payment-provider/payment-provider.simulator';
import { RedisService } from '../redis/redis.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { PaymentsRepository } from './payments.repository';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly idempotencyService: IdempotencyService,
    private readonly paymentProviderService: PaymentProviderService,
    private readonly redisService: RedisService,
  ) {}

  async createPayment(
    dto: CreatePaymentDto,
    rawIdempotencyKey: string | undefined,
    simulateBehavior?: SimulateBehavior,
  ): Promise<{
    statusCode: number;
    body: PaymentResponseDto;
    replayed: boolean;
  }> {
    return this.idempotencyService.execute<PaymentResponseDto>({
      rawKey: rawIdempotencyKey,
      fingerprintPayload: {
        amount: dto.amount,
        currency: dto.currency,
        customerReference: dto.customerReference,
      },
      handler: async (ctx) => {
        // Step 1: Create or recover the Payment record in a short DB operation
        let payment: Payment | null = null;
        if (ctx.isRecovery && ctx.existingPaymentId) {
          payment = await this.paymentsRepository.findById(
            ctx.existingPaymentId,
          );
        }

        if (!payment) {
          payment = await this.paymentsRepository.createProcessing({
            amount: dto.amount,
            currency: dto.currency,
            customerReference: dto.customerReference,
          });
          await this.idempotencyService.linkPayment(ctx.key, payment.id);
        }

        this.logger.log(
          `${ctx.isRecovery ? 'Recovering' : 'Processing'} payment=${payment.id} currency=${payment.currency} amount=${payment.amount.toFixed(2)}`,
        );

        // Step 2: Execute external payment provider OUTSIDE any DB transaction.
        // Downstream provider uses the same logical idempotency key for deduplication.
        const providerResult = await this.paymentProviderService.processPayment(
          {
            providerIdempotencyKey: ctx.key,
            paymentId: payment.id,
            amount: dto.amount,
            currency: dto.currency,
            simulateBehavior,
          },
        );

        // Step 3: Persist final payment outcome in PostgreSQL
        const finalStatus =
          providerResult.status === ProviderTransactionStatus.SUCCEEDED
            ? PaymentStatus.SUCCEEDED
            : PaymentStatus.FAILED;

        const updatedPayment = await this.paymentsRepository.updateResult(
          payment.id,
          {
            status: finalStatus,
            providerTransactionId: providerResult.providerTransactionId,
          },
        );

        const responseDto = this.toResponseDto(updatedPayment);

        // Invalidate/refresh payment read cache
        await this.redisService.setJson(
          `payment:${updatedPayment.id}`,
          responseDto,
          300,
        );

        return {
          statusCode: HttpStatus.CREATED,
          body: responseDto,
          paymentId: updatedPayment.id,
        };
      },
    });
  }

  async getPaymentById(paymentId: string): Promise<PaymentResponseDto> {
    const cacheKey = `payment:${paymentId}`;
    const cached =
      await this.redisService.getJson<PaymentResponseDto>(cacheKey);
    if (cached) {
      return cached;
    }

    const payment = await this.paymentsRepository.findById(paymentId);
    if (!payment) {
      throw new NotFoundException(`Payment "${paymentId}" not found.`);
    }

    const responseDto = this.toResponseDto(payment);
    await this.redisService.setJson(cacheKey, responseDto, 300);
    return responseDto;
  }

  async listPayments(query: ListPaymentsQueryDto) {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const { items, total } = await this.paymentsRepository.findAll({
      limit,
      offset,
      status: query.status,
      customerReference: query.customerReference,
    });

    return {
      items: items.map((p) => this.toResponseDto(p)),
      total,
      limit,
      offset,
    };
  }

  private toResponseDto(payment: Payment): PaymentResponseDto {
    return {
      id: payment.id,
      amount: payment.amount.toFixed(2),
      currency: payment.currency,
      status: payment.status,
      customerReference: payment.customerReference,
      providerTransactionId: payment.providerTransactionId,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
    };
  }
}
