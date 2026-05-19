import { TenantBaseModel } from '@/modules/System/models/TenantBaseModel';

export class ExchangeRateModel extends TenantBaseModel {
  public id!: number;
  public currencyCode!: string;
  public exchangeRate!: number;
  public date!: string;

  static get tableName() {
    return 'exchange_rates';
  }

  get timestamps() {
    return ['createdAt', 'updatedAt'];
  }
}
