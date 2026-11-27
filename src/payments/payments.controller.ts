import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { IdempotencyKey } from '../common/decorators/idempotency-key.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { SimulateBehavior } from '../payment-provider/payment-provider.simulator';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';
import { PaginatedPaymentsResponseDto } from './dto/paginated-payments-response.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { PaymentsService } from './payments.service';

const VALID_SIMULATE_BEHAVIORS: ReadonlySet<string> = new Set([
  'success',
  'fail',
  'delay',
  'timeout',
  'crash_after_provider',
]);

@ApiTags('Payments')
@Controller('api/v1/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create an idempotent payment',
    description:
      'Processes a payment idempotently using the required Idempotency-Key header. ' +
      'Duplicate requests with the same key and payload return the original response without re-charging.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Client-generated unique idempotency key (max 255 chars)',
    example: 'payment-order-1001',
  })
  @ApiHeader({
    name: 'X-Simulate-Behavior',
    required: false,
    description:
      'Optional simulator mode for testing failure and concurrency scenarios',
    schema: {
      type: 'string',
      enum: ['success', 'fail', 'delay', 'timeout', 'crash_after_provider'],
      default: 'success',
    },
  })
  @ApiBody({
    type: CreatePaymentDto,
    examples: {
      standardPayment: {
        summary: 'Standard Payment (PKR 5000)',
        value: {
          amount: 5000,
          currency: 'PKR',
          customerReference: 'customer-101',
        },
      },
      differentPayload: {
        summary: 'Different Payload (for 422 Mismatch Test)',
        value: {
          amount: 10000,
          currency: 'PKR',
          customerReference: 'customer-101',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Payment processed (or replayed from idempotency store)',
    headers: {
      'Idempotency-Replayed': {
        description:
          'true if returned from idempotency cache/store, false if newly processed',
        schema: { type: 'boolean' },
      },
    },
    type: PaymentResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or missing/invalid Idempotency-Key',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description:
      'Concurrent request with the same key is currently in progress',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 422,
    description: 'Idempotency-Key reused with a different payload',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 504,
    description: 'Simulated provider gateway timeout (safe to retry)',
    type: ErrorResponseDto,
  })
  async createPayment(
    @Body() dto: CreatePaymentDto,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Headers('x-simulate-behavior') simulateHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaymentResponseDto> {
    const simulateBehavior =
      simulateHeader && VALID_SIMULATE_BEHAVIORS.has(simulateHeader)
        ? (simulateHeader as SimulateBehavior)
        : undefined;

    const result = await this.paymentsService.createPayment(
      dto,
      idempotencyKey,
      simulateBehavior,
    );

    res.status(result.statusCode);
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.body;
  }

  @Get(':paymentId')
  @ApiOperation({ summary: 'Get payment by ID' })
  @ApiParam({
    name: 'paymentId',
    description: 'Payment UUID',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiResponse({
    status: 200,
    description: 'Payment details',
    type: PaymentResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid UUID format',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Payment not found',
    type: ErrorResponseDto,
  })
  async getPayment(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.getPaymentById(paymentId);
  }

  @Get()
  @ApiOperation({ summary: 'List payments with optional filters' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of payments',
    type: PaginatedPaymentsResponseDto,
  })
  async listPayments(
    @Query() query: ListPaymentsQueryDto,
  ): Promise<PaginatedPaymentsResponseDto> {
    return this.paymentsService.listPayments(query);
  }
}
