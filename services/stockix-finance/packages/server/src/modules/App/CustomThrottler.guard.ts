import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_ROUTE } from '../Auth/Auth.constants';

const UNTHROTTLED_PATHS = new Set(['/api/ping', '/api/health', '/api/internal']);

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  constructor(options: any, storageService: any, reflector: Reflector) {
    super(options, storageService, reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Record<string, string>>();
    const path: string = req['path'] ?? req['url'] ?? '';
    if (UNTHROTTLED_PATHS.has(path) || path.startsWith('/api/internal')) return true;

    return super.canActivate(context);
  }
}
