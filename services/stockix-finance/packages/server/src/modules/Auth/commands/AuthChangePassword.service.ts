import { Inject, Injectable } from '@nestjs/common';
import { SystemUser } from '@/modules/System/models/SystemUser';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { hashPassword } from '../Auth.utils';

@Injectable()
export class AuthChangePasswordService {
  constructor(
    @Inject(SystemUser.name)
    private readonly systemUserModel: typeof SystemUser,
    private readonly tenancyContext: TenancyContext,
  ) {}

  async changePassword(password: string): Promise<void> {
    const user = await this.tenancyContext.getSystemUser();
    const hashedPassword = await hashPassword(password);

    await this.systemUserModel.query().findById(user.id).patch({
      password: hashedPassword,
      mustChangePassword: false,
    });
  }
}
