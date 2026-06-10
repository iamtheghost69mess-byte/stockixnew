import { Model } from 'objection';
import bcrypt from 'bcryptjs';
import SystemModel from '@/system/models/SystemModel';

export default class SystemUser extends SystemModel {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  deletedAt?: Date | string | null;
  inviteAcceptedAt?: Date | string | null;
  tenantId?: number;

  static get tableName() {
    return 'users';
  }

  get timestamps() {
    return ['createdAt', 'updatedAt'];
  }

  static get virtualAttributes() {
    return ['fullName', 'isDeleted', 'isInviteAccepted'];
  }

  get isDeleted() {
    return !!this.deletedAt;
  }

  get isInviteAccepted() {
    return !!this.inviteAcceptedAt;
  }

  get fullName() {
    return (this.firstName + ' ' + this.lastName).trim();
  }

  static get relationMappings() {
    const Tenant = require('system/models/Tenant');

    return {
      tenant: {
        relation: Model.BelongsToOneRelation,
        modelClass: Tenant.default,
        join: {
          from: 'users.tenantId',
          to: 'tenants.id',
        },
      },
    };
  }

  verifyPassword(password: string) {
    return bcrypt.compareSync(password, this.password);
  }
}
