import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { events } from '@/common/events/events';
import { IOrganizationBuiltEventPayload } from '../Organization.types';
import { TenantLicense } from '@/modules/System/models/TenantLicense';
import { PlanSubscription } from '@/modules/Subscription/models/PlanSubscription';
import { TenantModel } from '@/modules/System/models/TenantModel';
import * as moment from 'moment';

@Injectable()
export class SeedTenantLicenseOnBuiltSubscriber {
  constructor(
    @Inject(TenantLicense.name)
    private readonly tenantLicenseModel: typeof TenantLicense,

    @Inject(PlanSubscription.name)
    private readonly planSubscriptionModel: typeof PlanSubscription,

    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,
  ) {}

  @OnEvent(events.organization.built)
  async handleOrganizationBuilt(payload: IOrganizationBuiltEventPayload) {
    const tenantId = payload.tenantId;

    const existingLicense = await this.tenantLicenseModel
      .query()
      .findOne({ tenantId });

    if (!existingLicense) {
      await this.tenantLicenseModel.query().insert({
        tenantId,
        planSlug: 'owner-managed',
        status: 'active',
        validFrom: moment().toMySqlDateTime(),
        expiresAt: null,
        gracePeriodDays: 30,
        maxUsers: 10,
        maxOrganizations: 1,
        isPerpetual: true,
        featureFlags: null,
      });
    }

    const existingSubscription = await this.planSubscriptionModel
      .query()
      .findOne({ tenantId });

    if (!existingSubscription) {
      const ownerManagedPlan = await this.tenantModel
        .knex()
        .from('subscription_plans')
        .where({ slug: 'owner-managed' })
        .orWhere({ slug: 'free' })
        .first();

      if (ownerManagedPlan) {
        await this.tenantModel.knex().table('subscription_plan_subscriptions').insert({
          tenant_id: tenantId,
          plan_id: ownerManagedPlan.id,
          slug: 'main',
          starts_at: moment().toMySqlDateTime(),
          ends_at: null,
        });
      }
    }
  }
}
