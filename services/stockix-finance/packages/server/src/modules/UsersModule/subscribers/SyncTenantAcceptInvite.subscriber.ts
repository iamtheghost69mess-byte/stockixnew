import { pick } from 'lodash';
import moment from 'moment';
import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { TenantModel } from '@/modules/System/models/TenantModel';
import UserTenant from '@/modules/System/models/UserTenant';
import { TenantUser } from '@/modules/Tenancy/TenancyModels/models/TenantUser.model';
import { events } from '@/common/events/events';
import { IAcceptInviteEventPayload } from '../Users.types';

@Injectable()
export class SyncTenantAcceptInviteSubscriber {
  constructor(
    @Inject(TenantUser.name)
    private readonly tenantUserModel: TenantModelProxy<typeof TenantUser>,

    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,

    @Inject(UserTenant.name)
    private readonly userTenantModel: typeof UserTenant,
  ) {}

  /**
   * Syncs accept invite to tenant user.
   * @param {IAcceptInviteEventPayload} payload -
   */
  @OnEvent(events.inviteUser.acceptInvite)
  async syncTenantAcceptInvite({
    inviteToken,
    user,
  }: IAcceptInviteEventPayload) {
    await this.tenantUserModel()
      .query()
      .where('systemUserId', inviteToken.userId)
      .update({
        ...pick(user, ['firstName', 'lastName', 'email', 'active']),
        inviteAcceptedAt: moment().toDate(),
      });

    try {
      const tenant = await this.tenantModel
        .query()
        .findById(inviteToken.tenantId);

      if (tenant) {
        const exists = await this.userTenantModel.query().findOne({
          userId: inviteToken.userId,
          tenantId: tenant.id,
        });

        if (!exists) {
          await this.userTenantModel.query().insert({
            userId: inviteToken.userId,
            tenantId: tenant.id,
            organizationId: tenant.organizationId,
            role: 'member',
          });
        }
      }
    } catch {
      // Non-fatal — membership may already exist from send-invite
    }
  }
}
