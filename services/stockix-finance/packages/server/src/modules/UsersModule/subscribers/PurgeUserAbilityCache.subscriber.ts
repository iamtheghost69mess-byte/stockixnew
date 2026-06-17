import {
  ITenantUserInactivatedPayload,
  ITenantUserActivatedPayload,
  ITenantUserDeletedPayload,
  ITenantUserEditedPayload,
} from '../Users.types';
import { OnEvent } from '@nestjs/event-emitter';
import { Injectable } from '@nestjs/common';
import { events } from '@/common/events/events';
import { ABILITIES_CACHE } from '@/modules/Roles/TenantAbilities';

@Injectable()
export class PurgeUserAbilityCacheSubscriber {
  /**
   * Purges authorized user ability once the user mutate.
   */
  @OnEvent(events.tenantUser.onEdited)
  @OnEvent(events.tenantUser.onActivated)
  @OnEvent(events.tenantUser.onInactivated)
  purgeAuthorizedUserAbility({
    tenantUser,
  }:
    | ITenantUserInactivatedPayload
    | ITenantUserActivatedPayload
    | ITenantUserDeletedPayload
    | ITenantUserEditedPayload) {
    // Cache keys are stored as `"${userId}_${organizationId}"` — delete all
    // entries matching this systemUserId across any organization they belong to.
    const prefix = `${tenantUser.systemUserId}_`;
    for (const key of ABILITIES_CACHE.keys()) {
      if ((key as string).startsWith(prefix)) {
        ABILITIES_CACHE.del(key);
      }
    }
  }
}