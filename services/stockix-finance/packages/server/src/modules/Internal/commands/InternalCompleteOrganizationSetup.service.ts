import moment from 'moment';
import { Inject, Injectable } from '@nestjs/common';
import { TenantMetadata } from '@/modules/System/models/TenantMetadataModel';

@Injectable()
export class InternalCompleteOrganizationSetupService {
  constructor(
    @Inject(TenantMetadata.name)
    private readonly tenantMetadataModel: typeof TenantMetadata,
  ) {}

  async executeForTenantId(tenantId: number): Promise<{ setupCompletedAt: string }> {
    if (!Number.isFinite(tenantId) || tenantId <= 0) {
      throw new Error('tenant_id_required');
    }

    const setupCompletedAt = moment().toMySqlDateTime();

    const updated = await this.tenantMetadataModel
      .query()
      .patch({ setupCompletedAt })
      .where({ tenantId });

    if (updated === 0) {
      throw new Error(`tenant_metadata_not_found:${tenantId}`);
    }

    return { setupCompletedAt };
  }
}
