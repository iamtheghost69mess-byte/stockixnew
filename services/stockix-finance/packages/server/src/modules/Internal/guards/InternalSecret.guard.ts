import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

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
    if (!secret) {
      throw new UnauthorizedException('Invalid internal secret.');
    }

    const secretBuf = Buffer.from(String(secret));
    const expectedBuf = Buffer.from(expected);

    // Pad to equal length before comparing so timingSafeEqual doesn't throw
    const maxLen = Math.max(secretBuf.length, expectedBuf.length);
    const a = Buffer.concat([secretBuf, Buffer.alloc(maxLen - secretBuf.length)]);
    const b = Buffer.concat([expectedBuf, Buffer.alloc(maxLen - expectedBuf.length)]);

    const match = secretBuf.length === expectedBuf.length && crypto.timingSafeEqual(a, b);
    if (!match) {
      throw new UnauthorizedException('Invalid internal secret.');
    }
    return true;
  }
}
