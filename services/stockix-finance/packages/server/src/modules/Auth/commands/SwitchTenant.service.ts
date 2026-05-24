import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import UserTenant from '@/modules/System/models/UserTenant';
import { SystemUser } from '@/modules/System/models/SystemUser';
import { TenantModel } from '@/modules/System/models/TenantModel';
import { AuthSigninService } from './AuthSignin.service';

@Injectable()
export class SwitchTenantService {
  constructor(
    private readonly clsService: ClsService,
    private readonly authSigninService: AuthSigninService,
    @Inject(UserTenant.name)
    private readonly userTenantModel: typeof UserTenant,
    @Inject(SystemUser.name)
    private readonly systemUserModel: typeof SystemUser,
    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,
  ) {}

  async switchTenant(organizationId: string) {
    const userId = this.clsService.get('userId');

    await this.userTenantModel
      .query()
      .findOne({ userId, organizationId })
      .throwIfNotFound();

    const user = await this.systemUserModel
      .query()
      .findById(userId)
      .throwIfNotFound();
    const tenant = await this.tenantModel
      .query()
      .findOne({ organizationId })
      .throwIfNotFound();

    const accessToken = await this.authSigninService.signToken(
      user,
      organizationId,
    );

    return {
      accessToken,
      organizationId: tenant.organizationId,
      tenantId: tenant.id,
      userId: user.id,
    };
  }
}
