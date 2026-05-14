import BaseModel from 'models/Model';

export default class TenantMetadata extends BaseModel {
  static get tableName() {
    return 'tenants_metadata';
  }

  $parseDatabaseJson(json) {
    const parsed = super.$parseDatabaseJson(json);
    if (typeof parsed.displayCurrencies === 'string') {
      try {
        parsed.displayCurrencies = JSON.parse(parsed.displayCurrencies);
      } catch {
        parsed.displayCurrencies = [];
      }
    }
    if (parsed.displayCurrencies == null) {
      parsed.displayCurrencies = [];
    }
    return parsed;
  }
}
