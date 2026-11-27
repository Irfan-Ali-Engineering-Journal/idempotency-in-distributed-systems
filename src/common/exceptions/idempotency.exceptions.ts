import { HttpException, HttpStatus } from '@nestjs/common';

export class MissingIdempotencyKeyException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'The Idempotency-Key HTTP header is required.',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class InvalidIdempotencyKeyException extends HttpException {
  constructor(reason: string) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: reason,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class IdempotencyPayloadMismatchException extends HttpException {
  constructor(key: string) {
    super(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Unprocessable Entity',
        code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
        message: `Idempotency key "${key}" was already used with a different request payload.`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class IdempotencyConflictException extends HttpException {
  constructor(key: string, retryAfterSeconds = 2) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: `A request with idempotency key "${key}" is currently being processed. Please retry shortly.`,
        retryAfterSeconds,
      },
      HttpStatus.CONFLICT,
    );
  }
}
