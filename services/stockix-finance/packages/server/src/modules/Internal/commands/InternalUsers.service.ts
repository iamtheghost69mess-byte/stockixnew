import { hashPassword } from '@/modules/Auth/Auth.utils';
import { HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import uniqid from 'uniqid';
import { events } from '@/common/events/events';
import { ServiceError } from '@/modules/Items/ServiceError';
import { SystemUser } from '@/modules/System/models/SystemUser';
import { TenantModel } from '@/modules/System/models/TenantModel';
import { TenantLicense } from '@/modules/System/models/TenantLicense';
import UserTenant from '@/modules/System/models/UserTenant';
import { UserInvite } from '@/modules/UsersModule/models/InviteUser.model';
import { IUserInviteTenantSyncedEventPayload } from '@/modules/UsersModule/Users.types';
import { ERRORS } from '@/modules/UsersModule/Users.constants';
import { TenantKnexFactory } from '@/modules/Tenancy/TenantKnexFactory';

export interface CreateInternalUserDto {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  roleId: number;
}

export interface UpdateInternalUserDto {
  roleId?: number;
  isActive?: boolean;
  firstName?: string;
  lastName?: string;
}

export interface InviteInternalUserDto {
  email: string;
  roleId: number;
  firstName?: string;
  lastName?: string;
}

@Injectable()
export class InternalUsersService {
  constructor(
    @Inject(SystemUser.name)
    private readonly systemUserModel: typeof SystemUser,

    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,

    @Inject(UserTenant.name)
    private readonly userTenantModel: typeof UserTenant,

    @Inject(TenantLicense.name)
    private readonly tenantLicenseModel: typeof TenantLicense,

    @Inject(UserInvite.name)
    private readonly inviteModel: typeof UserInvite,

    private readonly tenantKnexFactory: TenantKnexFactory,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createUser(tenantId: number, dto: CreateInternalUserDto) {
    await this.ensureTenantExists(tenantId);
    await this.validateUserLimit(tenantId);

    const hashedPassword = await hashPassword(dto.password);
    let user = await this.systemUserModel.query().findOne({ email: dto.email });
    let created = false;

    if (!user) {
      user = await this.systemUserModel.query().insert({
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        password: hashedPassword,
        active: true,
        verified: true,
        verifyToken: '',
        tenantId,
        mustChangePassword: true,
      });
      created = true;
    }

    const existingMembership = await this.userTenantModel
      .query()
      .findOne({ userId: user.id, tenantId });

    if (!existingMembership) {
      const tenant = await this.tenantModel.query().findById(tenantId);
      await this.userTenantModel.query().insert({
        userId: user.id,
        tenantId,
        organizationId: tenant.organizationId,
        role: null,
        isActive: true,
      });
    }

    const tenantKnex = await this.tenantKnexFactory.getKnexForTenantId(tenantId);
    const role = await tenantKnex('roles').where({ id: dto.roleId }).first();
    if (!role) {
      throw new NotFoundException(`Role not found: ${dto.roleId}`);
    }

    const existingTenantUser = await tenantKnex('users')
      .where({ email: dto.email })
      .first();

    if (!existingTenantUser) {
      await tenantKnex('users').insert({
        email: dto.email,
        first_name: dto.firstName,
        last_name: dto.lastName,
        role_id: dto.roleId,
        active: true,
        system_user_id: user.id,
        invite_accepted_at: new Date(),
      });
    }

    return { userId: user.id, email: user.email, tenantId, created };
  }

  async listUsers(tenantId: number) {
    await this.ensureTenantExists(tenantId);
    const tenantKnex = await this.tenantKnexFactory.getKnexForTenantId(tenantId);
    const users = await tenantKnex('users as u')
      .leftJoin('roles as r', 'u.role_id', 'r.id')
      .select(
        'u.id as userId',
        'u.email',
        'u.first_name as firstName',
        'u.last_name as lastName',
        'r.name as roleName',
        'u.active as isActive',
        'u.system_user_id as systemUserId',
      );

    const memberships = await this.userTenantModel.query().where({ tenantId });
    const membershipByUserId = new Map(
      memberships.map((m) => [m.userId, m]),
    );

    return users.map((row) => {
      const systemUserId = row.systemUserId as number | null;
      const membership = systemUserId
        ? membershipByUserId.get(systemUserId)
        : undefined;
      return {
        userId: row.userId,
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        roleName: row.roleName,
        isActive: membership?.isActive ?? row.isActive,
      };
    });
  }

  async updateUser(
    tenantId: number,
    userId: number,
    dto: UpdateInternalUserDto,
  ) {
    await this.ensureTenantExists(tenantId);
    const tenantKnex = await this.tenantKnexFactory.getKnexForTenantId(tenantId);
    const tenantUser = await tenantKnex('users').where({ id: userId }).first();
    if (!tenantUser) {
      throw new NotFoundException(`User not found: ${userId}`);
    }

    const tenantPatch: Record<string, unknown> = {};
    if (dto.roleId !== undefined) tenantPatch.roleId = dto.roleId;
    if (dto.isActive !== undefined) tenantPatch.active = dto.isActive;
    if (dto.firstName !== undefined) tenantPatch.firstName = dto.firstName;
    if (dto.lastName !== undefined) tenantPatch.lastName = dto.lastName;

    if (Object.keys(tenantPatch).length > 0) {
      await tenantKnex('users').where({ id: userId }).update(tenantPatch);
    }

    if (tenantUser.systemUserId) {
      const systemPatch: Record<string, unknown> = {};
      if (dto.firstName !== undefined) systemPatch.firstName = dto.firstName;
      if (dto.lastName !== undefined) systemPatch.lastName = dto.lastName;
      if (dto.isActive !== undefined) systemPatch.active = dto.isActive;

      if (Object.keys(systemPatch).length > 0) {
        await this.systemUserModel
          .query()
          .patch(systemPatch)
          .where({ id: tenantUser.systemUserId });
      }

      const membershipPatch: Record<string, unknown> = {};
      if (dto.isActive !== undefined) membershipPatch.isActive = dto.isActive;
      if (Object.keys(membershipPatch).length > 0) {
        await this.userTenantModel
          .query()
          .patch(membershipPatch)
          .where({ userId: tenantUser.systemUserId, tenantId });
      }
    }

    return { success: true };
  }

  async deleteUser(tenantId: number, userId: number) {
    await this.ensureTenantExists(tenantId);
    const tenantKnex = await this.tenantKnexFactory.getKnexForTenantId(tenantId);
    const tenantUser = await tenantKnex('users').where({ id: userId }).first();
    if (!tenantUser) {
      throw new NotFoundException(`User not found: ${userId}`);
    }

    const systemUserId = tenantUser.systemUserId as number | undefined;
    if (systemUserId) {
      await this.userTenantModel
        .query()
        .delete()
        .where({ userId: systemUserId, tenantId });

      const remaining = await this.userTenantModel
        .query()
        .where({ userId: systemUserId });

      if (remaining.length === 0) {
        await this.systemUserModel
          .query()
          .patch({ active: false })
          .where({ id: systemUserId });
      }
    }

    await tenantKnex('users').where({ id: userId }).delete();
    return { success: true };
  }

  async resetPassword(tenantId: number, userId: number, newPassword: string) {
    await this.ensureTenantExists(tenantId);
    const tenantKnex = await this.tenantKnexFactory.getKnexForTenantId(tenantId);
    const tenantUser = await tenantKnex('users').where({ id: userId }).first();
    if (!tenantUser?.systemUserId) {
      throw new NotFoundException(`User not found: ${userId}`);
    }

    const hashed = await hashPassword(newPassword);
    await this.systemUserModel
      .query()
      .patch({ password: hashed })
      .where({ id: tenantUser.systemUserId });

    return { success: true };
  }

  async setMembershipActive(
    tenantId: number,
    userId: number,
    isActive: boolean,
  ) {
    return this.updateUser(tenantId, userId, { isActive });
  }

  /**
   * Sends a Finance user invitation email (control-plane / internal API).
   */
  async sendInvite(tenantId: number, dto: InviteInternalUserDto) {
    const tenant = await this.ensureTenantExists(tenantId);
    await this.validateUserLimit(tenantId);

    const tenantKnex = await this.tenantKnexFactory.getKnexForTenantId(tenantId);
    const existing = await tenantKnex('users').where({ email: dto.email }).first();
    if (existing) {
      throw new ServiceError(ERRORS.EMAIL_EXISTS);
    }

    const role = await tenantKnex('roles').where({ id: dto.roleId }).first();
    if (!role) {
      throw new NotFoundException(`Role not found: ${dto.roleId}`);
    }

    const invitingRow = await tenantKnex('users').orderBy('id', 'asc').first();
    if (!invitingRow) {
      throw new NotFoundException('No users in tenant to send invite as');
    }

    const [insertedId] = await tenantKnex('users').insert({
      email: dto.email,
      first_name: dto.firstName?.trim() || '',
      last_name: dto.lastName?.trim() || '',
      role_id: dto.roleId,
      active: true,
      invited_at: new Date(),
    });

    const tenantUser = await tenantKnex('users').where({ id: insertedId }).first();
    if (!tenantUser) {
      throw new NotFoundException('Failed to create invited tenant user');
    }

    let systemUser = await this.systemUserModel.query().findOne({ email: dto.email });
    if (!systemUser) {
      systemUser = await this.systemUserModel.query().insert({
        email: dto.email,
        firstName: dto.firstName?.trim() || '',
        lastName: dto.lastName?.trim() || '',
        active: true,
        verified: true,
        verifyToken: '',
        tenantId,
      });
    }

    const existingMembership = await this.userTenantModel
      .query()
      .findOne({ userId: systemUser.id, tenantId });

    if (!existingMembership) {
      await this.userTenantModel.query().insert({
        userId: systemUser.id,
        tenantId,
        organizationId: tenant.organizationId,
        role: 'member',
        isActive: true,
      });
    }

    await tenantKnex('users')
      .where({ id: insertedId })
      .update({ system_user_id: systemUser.id });

    const inviteToken = uniqid();
    const invite = await this.inviteModel.query().insert({
      email: dto.email,
      tenantId,
      userId: systemUser.id,
      token: inviteToken,
    });

    await this.eventEmitter.emitAsync(
      events.inviteUser.sendInviteTenantSynced,
      {
        invite,
        user: tenantUser,
        invitingUser: invitingRow,
      } as IUserInviteTenantSyncedEventPayload,
    );

    return {
      userId: insertedId,
      email: dto.email,
      message: 'Invitation queued for delivery',
    };
  }

  private async ensureTenantExists(tenantId: number) {
    const tenant = await this.tenantModel.query().findById(tenantId);
    if (!tenant) {
      throw new NotFoundException(`Tenant not found: ${tenantId}`);
    }
    return tenant;
  }

  private async validateUserLimit(tenantId: number) {
    const licenseRow = await this.tenantLicenseModel
      .query()
      .findOne({ tenantId });
    if (!licenseRow) return;

    const countRow = await this.userTenantModel
      .query()
      .where({ tenantId })
      .count('id as count')
      .first();
    const userCount = Number((countRow as { count?: number })?.count ?? 0);
    if (userCount >= licenseRow.maxUsers) {
      throw new ServiceError(
        'USER_LIMIT_REACHED',
        'User limit reached for current plan',
        undefined,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }
}
