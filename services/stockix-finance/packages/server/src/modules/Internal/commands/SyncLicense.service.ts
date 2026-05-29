import { Inject, Injectable } from '@nestjs/common';
import { TenantLicense } from '@/modules/System/models/TenantLicense';
import { SyncLicenseDto } from '../dtos/SyncLicense.dto';
import { clearLicenseCache } from '@/modules/License/LicenseGuard.cache';

@Injectable()
export class SyncLicenseService {
  constructor(
    @Inject(TenantLicense.name)
    private readonly tenantLicenseModel: typeof TenantLicense,
  ) {}

  /**
   * curl -X POST http://localhost:3000/api/internal/license/sync \
   *   -H "Content-Type: application/json" \
   *   -H "x-internal-secret: $INTERNAL_API_SECRET" \
   *   -d '{"tenantId":1,"planSlug":"starter","status":"active","validFrom":"2024-01-01T00:00:00.000Z","expiresAt":null,"gracePeriodDays":30,"maxUsers":999,"maxActivations":3,"maxOrganizations":1,"isPerpetual":true,"featureFlags":null}'
   */
  async sync(dto: SyncLicenseDto): Promise<{ success: true; tenantId: number }> {
    const payload = {
      tenantId: dto.tenantId,
      planSlug: dto.planSlug,
      status: dto.status,
      validFrom: dto.validFrom,
      expiresAt: dto.expiresAt,
      gracePeriodDays: dto.gracePeriodDays,
      maxUsers: dto.maxUsers,
      maxActivations: dto.maxActivations,
      maxOrganizations: dto.maxOrganizations,
      isPerpetual: dto.isPerpetual,
      featureFlags: dto.featureFlags,
    };

    const existing = await this.tenantLicenseModel
      .query()
      .findOne({ tenantId: dto.tenantId });

    if (existing) {
      await this.tenantLicenseModel
        .query()
        .patch(payload)
        .where({ tenantId: dto.tenantId });
    } else {
      await this.tenantLicenseModel.query().insert(payload);
    }

    clearLicenseCache(dto.tenantId);

    return { success: true, tenantId: dto.tenantId };
  }
}
