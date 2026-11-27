import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { IdempotencyStatusResponseDto } from './dto/idempotency-status-response.dto';
import { IdempotencyService } from './idempotency.service';

@ApiTags('Idempotency')
@Controller('api/v1/idempotency')
export class IdempotencyController {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  @Get(':key')
  @ApiOperation({
    summary: 'Inspect idempotency record status',
    description:
      'Returns sanitized status metadata for a given idempotency key without exposing internal hashes or sensitive data.',
  })
  @ApiParam({
    name: 'key',
    description: 'Idempotency key',
    example: 'payment-order-1001',
  })
  @ApiResponse({
    status: 200,
    description: 'Idempotency record metadata',
    type: IdempotencyStatusResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid idempotency key format',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Idempotency record not found',
    type: ErrorResponseDto,
  })
  async getIdempotencyStatus(
    @Param('key') key: string,
  ): Promise<IdempotencyStatusResponseDto> {
    return this.idempotencyService.getStatus(key);
  }
}
