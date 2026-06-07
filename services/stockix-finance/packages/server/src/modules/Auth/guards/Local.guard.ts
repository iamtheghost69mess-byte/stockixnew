import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

function normalizeSigninCredential(body: Record<string, unknown> | undefined): void {
  if (!body || typeof body !== 'object') return;
  const existing = body.credential;
  if (typeof existing === 'string' && existing.trim().length > 0) return;
  const alias = body.crediential ?? body.email;
  if (typeof alias === 'string' && alias.trim().length > 0) {
    body.credential = alias;
  }
}

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{ body?: Record<string, unknown> }>();
    normalizeSigninCredential(req.body);
    return super.canActivate(context);
  }
}
