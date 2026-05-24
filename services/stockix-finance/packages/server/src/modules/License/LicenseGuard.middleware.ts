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

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const LICENSE_CACHE_TTL_MS = 60_000;

type LicenseCacheEntry = {
  effectiveStatus: LicenseStatus | null;
  cachedAt: number;
};

/** In-memory license status cache per tenant (hot path — avoids DB hit every request). */
const licenseCache = new Map<number, LicenseCacheEntry>();

const PUBLIC_PATH_PREFIXES = [
  '/api/internal',
  '/api/auth',
  '/api/ping',
  '/api/health',
  '/swagger',
];

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
    if (!effectiveStatus) {
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

    if (effectiveStatus === 'expired') {
      res.status(HttpStatus.PAYMENT_REQUIRED).json({
        error: 'LICENSE_EXPIRED',
        message: 'License expired. Contact your provider.',
        statusCode: HttpStatus.PAYMENT_REQUIRED,
      });
      return;
    }

    if (effectiveStatus === 'grace') {
      if (!WRITE_METHODS.has(req.method.toUpperCase())) {
        return next();
      }

      res.status(HttpStatus.PAYMENT_REQUIRED).json({
        error: 'LICENSE_GRACE',
        message: 'License in grace period. Upgrade to continue editing.',
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
    if (cached && Date.now() - cached.cachedAt < LICENSE_CACHE_TTL_MS) {
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
