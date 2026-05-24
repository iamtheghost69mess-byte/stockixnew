import BaseModel from 'models/Model';

export default class TenantMetadata extends BaseModel {
  baseCurrency: string;
  currencyCode: string;
  language?: string;
  timezone?: string;
  dateFormat?: string;
  fiscalYear?: string;
  displayCurrencies: string[];
  secondaryCurrency?: string | null;
  name?: string;

  static get tableName() {
    return 'tenants_metadata';
  }

  static findByTenantId(tenantId: number): Promise<TenantMetadata | undefined> {
    return TenantMetadata.query().findOne({ tenantId }) as Promise<TenantMetadata | undefined>;
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
