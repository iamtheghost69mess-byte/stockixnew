import { BaseModel } from '@/models/Model';
import { Model } from 'objection';

export type TenantLicenseStatus = 'active' | 'expired' | 'suspended' | 'grace';

export class TenantLicense extends BaseModel {
  public readonly id!: number;
  public readonly tenantId!: number;
  public readonly planSlug!: string;
  public readonly status!: TenantLicenseStatus;
  public readonly validFrom!: string;
  public readonly expiresAt!: string | null;
  public readonly gracePeriodDays!: number;
  public readonly maxUsers!: number;
  public readonly maxOrganizations!: number;
  public readonly isPerpetual!: boolean;
  public readonly featureFlags!: Record<string, boolean> | null;
  public readonly createdAt!: string;
  public readonly updatedAt!: string;

  static get tableName() {
    return 'tenant_licenses';
  }

  static get jsonAttributes() {
    return ['featureFlags'];
  }

  static get relationMappings() {
    const { TenantModel } = require('./TenantModel');

    return {
      tenant: {
        relation: Model.BelongsToOneRelation,
        modelClass: TenantModel,
        join: {
          from: 'tenant_licenses.tenantId',
          to: 'tenants.id',
        },
      },
    };
  }
}

export default TenantLicense;
