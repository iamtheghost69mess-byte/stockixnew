import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SystemUser } from '@/modules/System/models/SystemUser';
import { TenantModel } from '@/modules/System/models/TenantModel';
import UserTenant from '@/modules/System/models/UserTenant';

export interface ResolveTenantQuery {
  organizationId?: string;
  email?: string;
}

export interface ResolveTenantResult {
  tenantId: number;
  organizationId: string;
}

@Injectable()
export class InternalResolveTenantService {
  constructor(
    @Inject(SystemUser.name)
    private readonly systemUserModel: typeof SystemUser,
    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,
    @Inject(UserTenant.name)
    private readonly userTenantModel: typeof UserTenant,
  ) {}

  /**
   * Resolves Finance system tenant id for control-plane linking (user management, license sync).
   */
  async resolve(query: ResolveTenantQuery): Promise<ResolveTenantResult> {
    const organizationId = query.organizationId?.trim();
    const email = query.email?.trim().toLowerCase();

    if (organizationId) {
      const tenant = await this.tenantModel.query().findOne({ organizationId });
      if (tenant) {
        return { tenantId: tenant.id, organizationId: tenant.organizationId };
      }
    }

    if (email) {
      const user = await this.systemUserModel.query().findOne({ email });
      if (user) {
        if (user.tenantId) {
          const tenant = await this.tenantModel.query().findById(user.tenantId);
          if (tenant) {
            return { tenantId: tenant.id, organizationId: tenant.organizationId };
          }
        }
        const membership = await this.userTenantModel
          .query()
          .where({ userId: user.id })
          .orderBy('createdAt', 'desc')
          .first();
        if (membership) {
          return {
            tenantId: membership.tenantId,
            organizationId: membership.organizationId,
          };
        }
      }
    }

    throw new NotFoundException(
      'Could not resolve finance tenant. Provide organizationId and/or bootstrap admin email.',
    );
  }
}
