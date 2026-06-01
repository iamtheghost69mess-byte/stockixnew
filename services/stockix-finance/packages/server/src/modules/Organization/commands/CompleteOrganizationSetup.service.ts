import moment from 'moment';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { throwIfTenantNotExists } from '../Organization/_utils';
import { Inject, Injectable } from '@nestjs/common';
import { TenantMetadata } from '@/modules/System/models/TenantMetadataModel';

@Injectable()
export class CompleteOrganizationSetupService {
  constructor(
    private readonly tenancyContext: TenancyContext,

    @Inject(TenantMetadata.name)
    private readonly tenantMetadataModel: typeof TenantMetadata,
  ) {}

  /**
   * Marks setup wizard / profile completion for the current tenant.
   *
   * curl -X POST http://localhost:3000/api/organization/setup/complete \
   *   -H "Authorization: Bearer $TOKEN"
   */
  async execute(): Promise<{ setupCompletedAt: string }> {
    const tenant = await this.tenancyContext.getTenant(true);
    throwIfTenantNotExists(tenant);

    const setupCompletedAt = moment().toMySqlDateTime();

    await this.tenantMetadataModel
      .query()
      .patch({ setupCompletedAt })
      .where({ tenantId: tenant.id });

    return { setupCompletedAt };
  }
}
