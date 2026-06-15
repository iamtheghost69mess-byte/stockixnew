import moment from 'moment';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { TenantLicense } from '@/modules/System/models/TenantLicense';
import { TenantModel } from '@/modules/System/models/TenantModel';
import { ServiceError } from '@/modules/Items/ServiceError';
import { LicenseStatus, LicenseStatusMeta } from './License.types';

@Injectable()
export class LicenseService {
  constructor(
    @Inject(TenantLicense.name)
    private readonly tenantLicenseModel: typeof TenantLicense,

    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,
  ) {}

  async findByTenantId(tenantId: number): Promise<TenantLicense | undefined> {
    return this.tenantLicenseModel.query().findOne({ tenantId });
  }

  resolveEffectiveStatus(license: TenantLicense): LicenseStatus | null {
    if (license.isPerpetual) {
      return 'active';
    }
    if (license.status === 'revoked') {
      return 'revoked';
    }
    if (license.status === 'suspended') {
      return 'suspended';
    }
    if (license.status === 'active' || license.status === 'grace') {
      return license.status;
    }
    if (license.status === 'expired') {
      const graceEnd = this.getGracePeriodEndsAt(license);
      if (!graceEnd) {
        return 'expired';
      }
      return moment().isAfter(graceEnd) ? 'expired' : 'grace';
    }
    return license.status;
  }

  getGracePeriodEndsAt(license: TenantLicense): string | null {
    if (!license.expiresAt) {
      return null;
    }
    return moment(license.expiresAt)
      .add(license.gracePeriodDays ?? 30, 'days')
      .toISOString();
  }

  /**
   * Blocks creating another Finance organization when tenant_licenses.maxOrganizations is reached.
   * Uses the synced license row (typically tenant id 1 from Stockix provision).
   */
  async assertCanCreateOrganization(): Promise<void> {
    // Exclude tenants whose license is revoked or suspended — they should not consume
    // slots against the org limit after they've been de-licensed.
    const countRow = await this.tenantModel
      .query()
      .leftJoin('tenant_licenses as tl', 'tenants.id', 'tl.tenantId')
      .where(function () {
        this.whereNull('tl.tenantId').orWhereNotIn('tl.status', ['revoked', 'suspended']);
      })
      .countDistinct('tenants.id as count')
      .first();
    const orgCount = Number((countRow as { count?: number })?.count ?? 0);
    const license = await this.tenantLicenseModel
      .query()
      .orderBy('tenantId', 'asc')
      .first();
    if (!license) {
      return;
    }
    const limit = license.maxOrganizations;
    if (limit < 0) {
      return;
    }
    if (orgCount >= limit) {
      throw new ServiceError(
        'ORGANIZATION_LIMIT_REACHED',
        'Organization limit reached for current plan',
        undefined,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  async getLicenseStatusMeta(tenantId: number): Promise<LicenseStatusMeta> {
    const license = await this.findByTenantId(tenantId);
    if (!license) {
      return {
        licenseStatus: null,
        licenseExpiresAt: null,
        licenseGracePeriodEndsAt: null,
      };
    }

    const effective = this.resolveEffectiveStatus(license);

    return {
      licenseStatus: effective,
      licenseExpiresAt: license.expiresAt ?? null,
      licenseGracePeriodEndsAt: this.getGracePeriodEndsAt(license),
    };
  }
}
