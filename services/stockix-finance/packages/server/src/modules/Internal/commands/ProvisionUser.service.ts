import * as crypto from 'crypto';
import * as moment from 'moment';
import { hashPassword } from '@/modules/Auth/Auth.utils';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SystemUser } from '@/modules/System/models/SystemUser';
import { TenantModel } from '@/modules/System/models/TenantModel';
import UserTenant from '@/modules/System/models/UserTenant';
import { TenantsManagerService } from '@/modules/TenantDBManager/TenantsManager';
import { TenantMetadata } from '@/modules/System/models/TenantMetadataModel';
import {
  ProvisionUserDto,
  ProvisionUserRole,
} from '../dtos/ProvisionUser.dto';

export interface ProvisionUserResult {
  userId: number;
  email: string;
  tenantId: number;
  organizationId: string;
}

@Injectable()
export class ProvisionUserService {
  constructor(
    private readonly configService: ConfigService,
    private readonly tenantsManager: TenantsManagerService,

    @Inject(SystemUser.name)
    private readonly systemUserModel: typeof SystemUser,

    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,

    @Inject(UserTenant.name)
    private readonly userTenantModel: typeof UserTenant,

    @Inject(TenantMetadata.name)
    private readonly tenantMetadataModel: typeof TenantMetadata,
  ) {}

  /**
   * Creates or links a system user to a tenant (internal provisioning only).
   *
   * curl -X POST http://localhost:3000/api/internal/provision-user \
   *   -H "Content-Type: application/json" \
   *   -H "x-internal-secret: $INTERNAL_API_SECRET" \
   *   -d '{"email":"admin@example.com","firstName":"Jane","lastName":"Doe","password":"secret","role":"admin"}'
   */
  async provisionUser(dto: ProvisionUserDto): Promise<ProvisionUserResult> {
    const tenant = await this.resolveTenant(dto.tenantId);
    const hashedPassword = await hashPassword(dto.password);
    const signupConfirmation = this.configService.get('signupConfirmation');
    const verifyTokenCrypto = crypto.randomBytes(64).toString('hex');
    const verifyEnabled = signupConfirmation.enabled ?? false;
    const verifyToken = verifyEnabled ? verifyTokenCrypto : '';
    const verified = !verifyEnabled;
    const inviteAcceptedAt = moment().format('YYYY-MM-DD');
    const membershipRole = this.mapProvisionRole(dto.role);

    const existingUser = await this.systemUserModel
      .query()
      .findOne({ email: dto.email });

    let user: SystemUser;
    if (existingUser) {
      user = existingUser;
    } else {
      user = await this.systemUserModel.query().insert({
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        verifyToken,
        verified,
        active: true,
        password: hashedPassword,
        tenantId: tenant.id,
        inviteAcceptedAt,
      });
    }

    const existingMembership = await this.userTenantModel
      .query()
      .findOne({ userId: user.id, tenantId: tenant.id });

    if (!existingMembership) {
      await this.userTenantModel.query().insert({
        userId: user.id,
        tenantId: tenant.id,
        organizationId: tenant.organizationId,
        role: membershipRole,
      });
    }

    if (!user.tenantId) {
      await this.systemUserModel
        .query()
        .findById(user.id)
        .patch({ tenantId: tenant.id });
    }

    if (dto.organizationNumber) {
      const existingMetadata = await this.tenantMetadataModel
        .query()
        .findOne({ tenantId: tenant.id });

      if (existingMetadata) {
        await this.tenantMetadataModel
          .query()
          .patch({ organizationNumber: dto.organizationNumber })
          .where({ tenantId: tenant.id });
      } else {
        await this.tenantMetadataModel.query().insert({
          tenantId: tenant.id,
          name: dto.firstName,
          baseCurrency: 'USD',
          organizationNumber: dto.organizationNumber,
        });
      }
    }

    return {
      userId: user.id,
      email: user.email,
      tenantId: tenant.id,
      organizationId: tenant.organizationId,
    };
  }

  private async resolveTenant(tenantId?: number): Promise<TenantModel> {
    if (tenantId === undefined) {
      return this.tenantsManager.createTenant();
    }

    const tenant = await this.tenantModel.query().findById(tenantId);
    if (!tenant) {
      throw new NotFoundException(`No tenant found with id: ${tenantId}`);
    }
    return tenant;
  }

  private mapProvisionRole(role: ProvisionUserRole): string {
    switch (role) {
      case ProvisionUserRole.Admin:
        return 'owner';
      case ProvisionUserRole.Accountant:
        return 'accountant';
      case ProvisionUserRole.Viewer:
        return 'viewer';
      default:
        return 'viewer';
    }
  }
}
