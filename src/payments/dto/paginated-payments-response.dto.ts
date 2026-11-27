import { ApiProperty } from '@nestjs/swagger';
import { PaymentResponseDto } from './payment-response.dto';

export class PaginatedPaymentsResponseDto {
  @ApiProperty({ type: [PaymentResponseDto] })
  items: PaymentResponseDto[];

  @ApiProperty({ example: 1 })
  total: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 0 })
  offset: number;
}
