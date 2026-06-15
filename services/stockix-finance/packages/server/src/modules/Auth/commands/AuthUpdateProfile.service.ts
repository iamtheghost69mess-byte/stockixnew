import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { SystemUser } from '@/modules/System/models/SystemUser';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';

export interface UpdateProfileDto {
  firstName: string;
  lastName: string;
}

@Injectable()
export class AuthUpdateProfileService {
  constructor(
    @Inject(SystemUser.name)
    private readonly systemUserModel: typeof SystemUser,
    private readonly tenancyContext: TenancyContext,
  ) {}

  async updateProfile(dto: UpdateProfileDto): Promise<void> {
    const trimmed = {
      firstName: (dto.firstName ?? '').trim(),
      lastName: (dto.lastName ?? '').trim(),
    };
    if (!trimmed.firstName) {
      throw new BadRequestException('First name is required.');
    }
    if (trimmed.firstName.length > 100 || trimmed.lastName.length > 100) {
      throw new BadRequestException('Name fields must be 100 characters or fewer.');
    }
    const user = await this.tenancyContext.getSystemUser();
    await this.systemUserModel.query().findById(user.id).patch({
      firstName: trimmed.firstName,
      lastName: trimmed.lastName,
    });
  }
}
