import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InternalSecretGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const secret = request.headers['x-internal-secret'];
    const expected = this.configService.get<string>('INTERNAL_API_SECRET');

    if (!expected) {
      throw new UnauthorizedException(
        'INTERNAL_API_SECRET is not configured on this server.',
      );
    }
    if (!secret || secret !== expected) {
      throw new UnauthorizedException('Invalid internal secret.');
    }
    return true;
  }
}
