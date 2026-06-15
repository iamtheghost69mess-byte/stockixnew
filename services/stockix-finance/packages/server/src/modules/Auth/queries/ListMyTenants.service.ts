import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import UserTenant from '@/modules/System/models/UserTenant';

@Injectable()
export class ListMyTenantsService {
  constructor(
    private readonly clsService: ClsService,
    @Inject(UserTenant.name)
    private readonly userTenantModel: typeof UserTenant,
  ) {}

  async listMyTenants() {
    const userId = this.clsService.get('userId');

    const memberships = (await this.userTenantModel
      .query()
      .where({ userId })
      .withGraphFetched('tenant.metadata')
      .orderBy('createdAt', 'asc')) as Array<
      UserTenant & { tenant?: { metadata?: { name?: string | null } } }
    >;

    return memberships.map((m) => ({
      tenantId: m.tenantId,
      organizationId: m.organizationId,
      role: m.role,
      name: m.tenant?.metadata?.name ?? null,
    }));
  }
}
