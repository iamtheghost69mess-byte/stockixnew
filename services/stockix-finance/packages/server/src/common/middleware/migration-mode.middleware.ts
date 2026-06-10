import {
  HttpException,
  HttpStatus,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * When MIGRATION_MODE=true, block tenant write operations during schema/service migrations.
 * Reads and health checks continue to work.
 */
@Injectable()
export class MigrationModeMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const enabled =
      process.env.MIGRATION_MODE === 'true' ||
      process.env.MIGRATION_MODE === '1';

    if (!enabled || SAFE_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    const isInternal =
      req.path.startsWith('/api/internal') ||
      req.path.startsWith('/api/ping');

    if (isInternal) {
      next();
      return;
    }

    throw new HttpException(
      {
        error: 'MIGRATION_MODE',
        message:
          'Tenant writes are temporarily disabled while a migration is in progress.',
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
