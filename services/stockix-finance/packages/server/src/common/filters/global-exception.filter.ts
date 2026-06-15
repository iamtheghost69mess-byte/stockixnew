import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import * as nodePath from 'path';
import {
  FINANCE_WEBAPP_INDEX,
  isFinanceWebappApiPath,
  isFinanceWebappBuilt,
} from '@/modules/App/finance-webapp.constants';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly cls: ClsService) {}

  private traceContext(request: Request) {
    return {
      requestId: this.cls.get('requestId') ?? this.cls.getId(),
      organizationId:
        this.cls.get('organizationId') ?? request.headers['organization-id'],
      tenantId: this.cls.get('tenantId'),
      userId: this.cls.get('userId'),
      method: request.method,
      path: request.originalUrl ?? request.url,
    };
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isProduction = process.env.NODE_ENV === 'production';
    const trace = this.traceContext(request);

    if (
      exception instanceof NotFoundException
      && isFinanceWebappBuilt()
      && (request.method === 'GET' || request.method === 'HEAD')
      && !isFinanceWebappApiPath(request.path)
      && !nodePath.extname(request.path)
    ) {
      response.sendFile(FINANCE_WEBAPP_INDEX);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : typeof body === 'object' && body && 'message' in body
            ? (body as { message: string | string[] }).message
            : exception.message;

      this.logger.warn(
        `Http Exception: ${Array.isArray(message) ? message.join(', ') : message} (Status: ${status})`
      );

      response.status(status).json({
        error: HttpStatus[status] ?? 'ERROR',
        message: Array.isArray(message) ? message.join(', ') : message,
        statusCode: status,
        requestId: trace.requestId,
        ...(isProduction
          ? {}
          : { details: typeof body === 'object' ? body : undefined }),
      });
      return;
    }

    this.logger.error(
      `Unhandled exception: ${exception instanceof Error ? exception.message : String(exception)}`,
      exception instanceof Error ? exception.stack : undefined
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: isProduction
        ? 'An unexpected error occurred.'
        : exception instanceof Error
          ? exception.message
          : 'Unknown error',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      requestId: trace.requestId,
      ...(isProduction
        ? {}
        : {
            stack:
              exception instanceof Error ? exception.stack : undefined,
          }),
    });
  }
}
