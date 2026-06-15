import {
  HttpStatus,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ClsService } from 'nestjs-cls';
import { LicenseService } from './License.service';
import { TenantModel } from '@/modules/System/models/TenantModel';
import { Inject } from '@nestjs/common';
import { LicenseStatus } from './License.types';
import {
  getLicenseCacheTtlMs,
  licenseCache,
} from './LicenseGuard.cache';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const PUBLIC_PATH_PREFIXES = [
  '/api/internal',
  '/api/auth',
  '/api/ping',
  '/api/health',
  '/swagger',
];

export { clearLicenseCache } from './LicenseGuard.cache';

@Injectable()
export class LicenseGuardMiddleware implements NestMiddleware {
  constructor(
    private readonly clsService: ClsService,
    private readonly licenseService: LicenseService,
    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const path = req.originalUrl ?? req.url ?? '';

    if (PUBLIC_PATH_PREFIXES.some((prefix) => path.includes(prefix))) {
      return next();
    }

    const organizationId =
      (req.headers['organization-id'] as string | undefined) ??
      this.clsService.get('organizationId');

    if (!organizationId) {
      return next();
    }

    const tenant = await this.tenantModel
      .query()
      .findOne({ organizationId });

    if (!tenant) {
      return next();
    }

    const effectiveStatus = await this.resolveEffectiveStatusCached(tenant.id);
    const isWrite = WRITE_METHODS.has(req.method.toUpperCase());

    if (!effectiveStatus) {
      if (isWrite) {
        res.status(HttpStatus.PAYMENT_REQUIRED).json({
          error: 'LICENSE_NOT_CONFIGURED',
          message: 'No license is configured for this tenant. Contact your provider.',
          statusCode: HttpStatus.PAYMENT_REQUIRED,
        });
        return;
      }
      return next();
    }

    (req as Request & { licenseStatus?: string }).licenseStatus =
      effectiveStatus;

    if (effectiveStatus === 'active') {
      return next();
    }

    if (effectiveStatus === 'revoked') {
      res.status(HttpStatus.PAYMENT_REQUIRED).json({
        error: 'LICENSE_REVOKED',
        message: 'License permanently revoked. Contact your provider.',
        statusCode: HttpStatus.PAYMENT_REQUIRED,
      });
      return;
    }

    if (effectiveStatus === 'suspended') {
      res.status(HttpStatus.PAYMENT_REQUIRED).json({
        error: 'LICENSE_SUSPENDED',
        message: 'Account suspended. Contact your provider.',
        statusCode: HttpStatus.PAYMENT_REQUIRED,
      });
      return;
    }

    if (effectiveStatus === 'expired' || effectiveStatus === 'grace') {
      if (!isWrite) {
        return next();
      }

      const errorCode =
        effectiveStatus === 'expired' ? 'LICENSE_EXPIRED' : 'LICENSE_GRACE';
      const message =
        effectiveStatus === 'expired'
          ? 'License expired. You can view data but cannot make changes.'
          : 'License in grace period. Upgrade to continue editing.';

      res.status(HttpStatus.PAYMENT_REQUIRED).json({
        error: errorCode,
        message,
        statusCode: HttpStatus.PAYMENT_REQUIRED,
      });
      return;
    }

    return next();
  }

  private async resolveEffectiveStatusCached(
    tenantId: number,
  ): Promise<LicenseStatus | null> {
    const cached = licenseCache.get(tenantId);
    if (cached && Date.now() - cached.cachedAt < getLicenseCacheTtlMs()) {
      return cached.effectiveStatus;
    }

    const license = await this.licenseService.findByTenantId(tenantId);
    if (!license) {
      licenseCache.set(tenantId, {
        effectiveStatus: null,
        cachedAt: Date.now(),
      });
      return null;
    }

    const effectiveStatus =
      this.licenseService.resolveEffectiveStatus(license);
    licenseCache.set(tenantId, {
      effectiveStatus,
      cachedAt: Date.now(),
    });
    return effectiveStatus;
  }
}
