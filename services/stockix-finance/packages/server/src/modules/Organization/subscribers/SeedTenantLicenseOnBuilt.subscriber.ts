import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { events } from '@/common/events/events';
import { IOrganizationBuiltEventPayload } from '../Organization.types';
import { TenantLicense } from '@/modules/System/models/TenantLicense';
import { PlanSubscription } from '@/modules/Subscription/models/PlanSubscription';
import { TenantModel } from '@/modules/System/models/TenantModel';
import moment from 'moment';

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
      let maxOrganizations = 1;
      let maxUsers = 10;
      const tenantRow = await this.tenantModel.query().findById(tenantId);
      const parentTenantId = tenantRow?.parentTenantId;
      if (parentTenantId) {
        const parentLicense = await this.tenantLicenseModel
          .query()
          .findOne({ tenantId: parentTenantId });
        if (parentLicense) {
          maxOrganizations = parentLicense.maxOrganizations;
          maxUsers = parentLicense.maxUsers;
        }
      }

      // Seed as suspended so the tenant cannot access Finance until the control
      // plane pushes a real license via POST /api/internal/license/sync.
      // gracePeriodDays matches DEFAULT_GRACE_PERIOD_DAYS on the control plane (7).
      await this.tenantLicenseModel.query().insert({
        tenantId,
        planSlug: 'owner-managed',
        status: 'suspended',
        validFrom: moment().toMySqlDateTime(),
        expiresAt: null,
        gracePeriodDays: 7,
        maxUsers,
        maxOrganizations,
        isPerpetual: false,
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
