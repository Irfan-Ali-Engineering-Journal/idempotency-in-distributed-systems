import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IdempotencyStatus } from '@prisma/client';

export class IdempotencyStatusResponseDto {
  @ApiProperty({ example: 'payment-order-1001' })
  key: string;

  @ApiProperty({
    enum: IdempotencyStatus,
    example: IdempotencyStatus.COMPLETED,
  })
  status: IdempotencyStatus;

  @ApiPropertyOptional({
    example: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    nullable: true,
  })
  paymentId: string | null;

  @ApiPropertyOptional({ example: 201, nullable: true })
  responseStatusCode: number | null;

  @ApiProperty({ example: '2026-11-26T04:30:00.000Z' })
  expiresAt: Date;

  @ApiProperty({ example: '2026-11-25T04:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-11-25T04:30:01.000Z' })
  updatedAt: Date;
}
