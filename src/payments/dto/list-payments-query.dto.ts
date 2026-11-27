import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListPaymentsQueryDto {
  @ApiPropertyOptional({
    description: 'Maximum number of records to return',
    default: 20,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Number of records to skip', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({
    enum: PaymentStatus,
    description: 'Filter by payment status',
  })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ description: 'Filter by customer reference' })
  @IsOptional()
  @IsString()
  customerReference?: string;
}
