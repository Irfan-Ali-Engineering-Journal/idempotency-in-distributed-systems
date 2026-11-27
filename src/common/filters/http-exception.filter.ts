import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred. Please try again later.',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        body = {
          statusCode: status,
          message: exceptionResponse,
        };
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        body = { ...(exceptionResponse as Record<string, unknown>) };
      }

      if (
        status === HttpStatus.CONFLICT &&
        typeof body.retryAfterSeconds === 'number'
      ) {
        response.setHeader('Retry-After', String(body.retryAfterSeconds));
      }
    } else {
      // Never expose internal stack traces, Prisma errors, or DB details to API clients
      const errMessage =
        exception instanceof Error ? exception.message : 'Unknown error';
      const errStack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}: ${errMessage}`,
        errStack,
      );
    }

    response.status(status).json({
      ...body,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
