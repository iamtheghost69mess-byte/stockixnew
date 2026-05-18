import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SystemUser } from '@/modules/System/models/SystemUser';
import { TenantModel } from '@/modules/System/models/TenantModel';
import UserTenant from '@/modules/System/models/UserTenant';

export interface AttachUserToTenantInput {
  email: string;
  organizationId: string;
}

@Injectable()
export class AttachUserToTenantService {
  constructor(
    @Inject(SystemUser.name)
    private readonly systemUserModel: typeof SystemUser,
    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,
    @Inject(UserTenant.name)
    private readonly userTenantModel: typeof UserTenant,
  ) {}

  async attachUser(input: AttachUserToTenantInput): Promise<void> {
    const { email, organizationId } = input;

    const user = await this.systemUserModel.query().findOne({ email });
    if (!user) {
      throw new NotFoundException(`No user found with email: ${email}`);
    }

    const tenant = await this.tenantModel
      .query()
      .findOne({ organizationId });
    if (!tenant) {
      throw new NotFoundException(
        `No tenant found with organizationId: ${organizationId}`,
      );
    }

    const existing = await this.userTenantModel
      .query()
      .findOne({ userId: user.id, tenantId: tenant.id });

    if (existing) {
      return;
    }

    await this.userTenantModel.query().insert({
      userId: user.id,
      tenantId: tenant.id,
      organizationId: tenant.organizationId,
      role: null,
    });
  }
}
