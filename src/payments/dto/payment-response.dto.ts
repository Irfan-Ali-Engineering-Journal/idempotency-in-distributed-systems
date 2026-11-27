import { ApiProperty } from '@nestjs/swagger';
import { PaymentStatus } from '@prisma/client';

export class PaymentResponseDto {
  @ApiProperty({ example: '7c9e6679-7425-40de-944b-e07fc1f90ae7' })
  id: string;

  @ApiProperty({ example: '5000.00' })
  amount: string;

  @ApiProperty({ example: 'PKR' })
  currency: string;

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.SUCCEEDED })
  status: PaymentStatus;

  @ApiProperty({ example: 'customer-101' })
  customerReference: string;

  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    nullable: true,
  })
  providerTransactionId: string | null;

  @ApiProperty({ example: '2026-11-25T04:30:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-11-25T04:30:01.000Z' })
  updatedAt: string;

  [key: string]: unknown;
}
