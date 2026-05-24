import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const isProduction = process.env.NODE_ENV === 'production';

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : typeof body === 'object' && body && 'message' in body
            ? (body as { message: string | string[] }).message
            : exception.message;

      response.status(status).json({
        error: HttpStatus[status] ?? 'ERROR',
        message: Array.isArray(message) ? message.join(', ') : message,
        statusCode: status,
        ...(isProduction
          ? {}
          : { details: typeof body === 'object' ? body : undefined }),
      });
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: isProduction
        ? 'An unexpected error occurred.'
        : exception instanceof Error
          ? exception.message
          : 'Unknown error',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      ...(isProduction
        ? {}
        : {
            stack:
              exception instanceof Error ? exception.stack : undefined,
          }),
    });
  }
}
