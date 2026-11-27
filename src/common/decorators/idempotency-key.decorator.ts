import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const header = request.headers['idempotency-key'];
    if (Array.isArray(header)) {
      return header[0];
    }
    return header;
  },
);
