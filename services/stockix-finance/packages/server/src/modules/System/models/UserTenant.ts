import { BaseModel } from '@/models/Model';
import { Model } from 'objection';
import type { TenantModel } from './TenantModel';

export class UserTenant extends BaseModel {
  public readonly id!: number;
  public readonly userId!: number;
  public readonly tenantId!: number;
  public readonly organizationId!: string;
  public readonly role!: string | null;
  public readonly isActive!: boolean;
  public tenant?: TenantModel;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static get tableName() {
    return 'user_tenants';
  }

  static get relationMappings() {
    const { SystemUser } = require('./SystemUser');
    const { TenantModel } = require('./TenantModel');

    return {
      user: {
        relation: Model.BelongsToOneRelation,
        modelClass: SystemUser,
        join: {
          from: 'user_tenants.userId',
          to: 'users.id',
        },
      },
      tenant: {
        relation: Model.BelongsToOneRelation,
        modelClass: TenantModel,
        join: {
          from: 'user_tenants.tenantId',
          to: 'tenants.id',
        },
      },
    };
  }
}

export default UserTenant;
