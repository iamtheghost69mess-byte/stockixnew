import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestContextInterceptor.name);

  constructor(private readonly cls: ClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const requestId = this.cls.getId();
    this.cls.set('requestId', requestId);

    const started = Date.now();
    const baseContext = {
      requestId,
      method: request.method,
      path: request.originalUrl ?? request.url,
      organizationId: this.cls.get('organizationId'),
      tenantId: this.cls.get('tenantId'),
      userId: this.cls.get('userId'),
    };

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            JSON.stringify({
              ...baseContext,
              statusCode: response.statusCode,
              durationMs: Date.now() - started,
              level: 'info',
              type: 'http_request',
            }),
          );
        },
        error: (err: unknown) => {
          this.logger.warn(
            JSON.stringify({
              ...baseContext,
              statusCode: response.statusCode,
              durationMs: Date.now() - started,
              level: 'warn',
              type: 'http_request_error',
              message: err instanceof Error ? err.message : String(err),
            }),
          );
        },
      }),
    );
  }
}
