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

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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

    if (
      path.includes('/api/internal') ||
      path.includes('/api/auth') ||
      path.includes('/api/ping')
    ) {
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

    const license = await this.licenseService.findByTenantId(tenant.id);
    if (!license) {
      return next();
    }

    const effectiveStatus = this.licenseService.resolveEffectiveStatus(license);
    (req as Request & { licenseStatus?: string }).licenseStatus = effectiveStatus;

    if (effectiveStatus === 'active') {
      return next();
    }

    if (effectiveStatus === 'suspended') {
      res.status(HttpStatus.PAYMENT_REQUIRED).json({
        error: 'LICENSE_SUSPENDED',
        message: 'Account suspended. Contact your provider.',
      });
      return;
    }

    if (effectiveStatus === 'expired') {
      res.status(HttpStatus.PAYMENT_REQUIRED).json({
        error: 'LICENSE_EXPIRED',
        message: 'License expired. Contact your provider.',
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
      });
      return;
    }

    return next();
  }
}
