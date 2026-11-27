import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 422 })
  statusCode: number;

  @ApiProperty({ example: 'Unprocessable Entity' })
  error: string;

  @ApiPropertyOptional({ example: 'IDEMPOTENCY_PAYLOAD_MISMATCH' })
  code?: string;

  @ApiProperty({
    example:
      'Idempotency key "payment-order-1001" was already used with a different request payload.',
  })
  message: string;

  @ApiPropertyOptional({ example: 2 })
  retryAfterSeconds?: number;

  @ApiProperty({ example: '2026-11-25T04:30:00.000Z' })
  timestamp: string;

  @ApiProperty({ example: '/api/v1/payments' })
  path: string;
}
