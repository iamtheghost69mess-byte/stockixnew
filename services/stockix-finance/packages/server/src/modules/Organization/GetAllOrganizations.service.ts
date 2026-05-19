import { Inject, Injectable } from '@nestjs/common';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import UserTenant from '@/modules/System/models/UserTenant';

export interface OrganizationListItem {
  tenantId: number;
  organizationId: string;
  name: string | null;
  logoKey: string | null;
  organizationNumber: string | null;
  isCurrent: boolean;
}

@Injectable()
export class GetAllOrganizationsService {
  constructor(
    private readonly tenancyContext: TenancyContext,

    @Inject(UserTenant.name)
    private readonly userTenantModel: typeof UserTenant,
  ) {}

  async getAllOrganizations(userId: number): Promise<OrganizationListItem[]> {
    const currentTenant = await this.tenancyContext.getTenant(true);
    const memberships = await this.userTenantModel
      .query()
      .where({ userId })
      .withGraphFetched('tenant.metadata');

    return memberships.map((membership) => ({
      tenantId: membership.tenantId,
      organizationId: membership.organizationId,
      name: membership.tenant?.metadata?.name ?? null,
      logoKey: membership.tenant?.metadata?.logoKey ?? null,
      organizationNumber:
        membership.tenant?.metadata?.organizationNumber ?? null,
      isCurrent: membership.tenantId === currentTenant.id,
    }));
  }
}
