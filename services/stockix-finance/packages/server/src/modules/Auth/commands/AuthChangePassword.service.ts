import { Inject, Injectable } from '@nestjs/common';
import { SystemUser } from '@/modules/System/models/SystemUser';
import { hashPassword } from '../Auth.utils';

@Injectable()
export class AuthChangePasswordService {
  constructor(
    @Inject(SystemUser.name)
    private readonly systemUserModel: typeof SystemUser,
  ) {}

  async changePassword(userId: number, password: string): Promise<void> {
    const hashedPassword = await hashPassword(password);
    await this.systemUserModel.query().findById(userId).patch({
      password: hashedPassword,
      mustChangePassword: false,
    });
  }
}
