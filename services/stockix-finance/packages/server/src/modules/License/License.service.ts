import * as moment from 'moment';
import { Inject, Injectable } from '@nestjs/common';
import { TenantLicense } from '@/modules/System/models/TenantLicense';
import { LicenseStatus, LicenseStatusMeta } from './License.types';

@Injectable()
export class LicenseService {
  constructor(
    @Inject(TenantLicense.name)
    private readonly tenantLicenseModel: typeof TenantLicense,
  ) {}

  async findByTenantId(tenantId: number): Promise<TenantLicense | undefined> {
    return this.tenantLicenseModel.query().findOne({ tenantId });
  }

  resolveEffectiveStatus(license: TenantLicense): LicenseStatus | null {
    if (license.isPerpetual) {
      return 'active';
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
