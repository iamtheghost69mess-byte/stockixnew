import * as bcrypt from 'bcrypt';
import { BaseModel } from '@/models/Model';

export class SystemUser extends BaseModel {
  public readonly firstName: string;
  public readonly lastName: string;
  public readonly email: string;
  public password: string;

  public readonly active: boolean;
  public readonly tenantId?: number | null;
  public readonly verifyToken: string;
  public readonly verified: boolean;
  public readonly inviteAcceptedAt!: string;
  public readonly mustChangePassword?: boolean;

  static get tableName() {
    return 'users';
  }

  static get relationMappings() {
    const { Model } = require('objection');

    return {
      userTenants: {
        relation: Model.HasManyRelation,
        modelClass: require('./UserTenant').default,
        join: {
          from: 'users.id',
          to: 'user_tenants.user_id',
        },
      },
    };
  }

  /**
   * Model modifiers.
   */
  static get modifiers() {
    return {
      /**
       * Filters the invite accepted users.
       */
      inviteAccepted(query) {
        query.whereNotNull('invite_accepted_at');
      },

      active(query) {
        query.where('active', true);
      },
    };
  }

  async hashPassword(): Promise<void> {
    const salt = await bcrypt.genSalt();
    if (!/^\$2[abxy]?\$\d+\$/.test(this.password)) {
      this.password = await bcrypt.hash(this.password, salt);
    }
  }

  async checkPassword(plainPassword: string): Promise<boolean> {
    return await bcrypt.compare(plainPassword, this.password);
  }
}
