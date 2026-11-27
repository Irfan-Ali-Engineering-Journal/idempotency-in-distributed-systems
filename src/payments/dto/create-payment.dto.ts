import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
} from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({
    description: 'Payment amount in major currency units',
    example: 5000,
    minimum: 0.01,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100000000)
  amount: number;

  @ApiProperty({
    description: 'ISO 4217 currency code',
    example: 'PKR',
  })
  @IsString()
  @IsNotEmpty()
  @Length(3, 10)
  @Matches(/^[A-Za-z]+$/, {
    message: 'currency must contain only alphabetic characters',
  })
  currency: string;

  @ApiProperty({
    description: 'Unique customer or order reference',
    example: 'customer-101',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  customerReference: string;
}
