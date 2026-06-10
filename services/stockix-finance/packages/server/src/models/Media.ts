import { TenantBaseModel } from '@/modules/System/models/TenantBaseModel';

export class Media extends TenantBaseModel {
  static get tableName() {
    return 'media';
  }

  get timestamps() {
    return ['createdAt', 'updatedAt'];
  }
}
