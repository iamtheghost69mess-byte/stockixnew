import { mixin } from 'objection';
import TenantModel from 'models/TenantModel';
import ModelSetting from './ModelSetting';

export default class ExchangeRate extends mixin(TenantModel, [ModelSetting]) {
  static get tableName() {
    return 'exchange_rates';
  }

  get timestamps() {
    return ['createdAt', 'updatedAt'];
  }

  static get meta() {
    return {
      defaultFilterField: 'currency_code',
      defaultSort: {
        sortField: 'created_at',
        sortOrder: 'DESC',
      },
      fields: {
        currency_code: {
          name: 'exchange_rate.field.currency_code',
          column: 'currency_code',
          fieldType: 'text',
        },
        exchange_rate: {
          name: 'exchange_rate.field.exchange_rate',
          column: 'exchange_rate',
          fieldType: 'number',
        },
        date: {
          name: 'exchange_rate.field.date',
          column: 'date',
          fieldType: 'text',
        },
        created_at: {
          name: 'exchange_rate.field.created_at',
          column: 'created_at',
          fieldType: 'text',
          columnType: 'date',
        },
      },
    };
  }
}