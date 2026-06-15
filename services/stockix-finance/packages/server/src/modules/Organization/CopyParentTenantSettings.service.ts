import { Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { TenantKnexFactory } from '@/modules/Tenancy/TenantKnexFactory';

const ACCOUNT_SETTING_KEYS = new Set([
  'preferred_inventory_account',
  'preferred_sell_account',
  'preferred_cost_account',
  'preferred_deposit_account',
  'preferred_advance_deposit',
  'preferred_payment_account',
]);

export type ChartOfAccountsExport = {
  accounts: Array<Record<string, unknown>>;
  taxRates: Array<Record<string, unknown>>;
  settings: Array<Record<string, unknown>>;
};

@Injectable()
export class CopyParentTenantSettingsService {
  constructor(private readonly tenantKnexFactory: TenantKnexFactory) {}

  /**
   * Copies chart of accounts, tax rates, and account-pointer settings from parent to child.
   */
  async copyFromParent(
    tenantId: number,
    parentTenantId: number,
  ): Promise<{
    accountsCopied: number;
    taxRatesCopied: number;
    settingsCopied: number;
  }> {
    const parentKnex = await this.tenantKnexFactory.getKnexForTenantId(parentTenantId);
    const childKnex = await this.tenantKnexFactory.getKnexForTenantId(tenantId);

    const parentAccounts = await parentKnex('accounts').select('*');
    const { accountIdMap, accountsCopied } = await this.copyAccountsFromRows(
      parentAccounts,
      childKnex,
    );
    const taxRatesCopied = await this.copyTaxRates(parentKnex, childKnex);
    const settingsCopied = await this.copyAccountSettings(
      parentKnex,
      childKnex,
      accountIdMap,
    );

    return {
      accountsCopied,
      taxRatesCopied,
      settingsCopied,
    };
  }

  /**
   * Exports chart of accounts, tax rates, and account-pointer settings for cross-stack copy.
   */
  async exportChartOfAccounts(tenantId: number): Promise<ChartOfAccountsExport> {
    const knex = await this.tenantKnexFactory.getKnexForTenantId(tenantId);
    const accounts = await knex('accounts').select('*');
    const taxRates = await knex('tax_rates').select('*');
    const settings = (await knex('settings').select('*')).filter((row) =>
      ACCOUNT_SETTING_KEYS.has(String(row.key)),
    );

    return { accounts, taxRates, settings };
  }

  /**
   * Imports chart of accounts payload exported from another Finance stack (cross-stack copy).
   */
  async importChartOfAccounts(
    tenantId: number,
    payload: ChartOfAccountsExport,
  ): Promise<{
    accountsCopied: number;
    taxRatesCopied: number;
    settingsCopied: number;
  }> {
    const childKnex = await this.tenantKnexFactory.getKnexForTenantId(tenantId);

    const { accountIdMap, accountsCopied } = await this.copyAccountsFromRows(
      payload.accounts,
      childKnex,
    );
    const taxRatesCopied = await this.copyTaxRatesFromRows(
      payload.taxRates,
      childKnex,
    );
    const settingsCopied = await this.copyAccountSettingsFromRows(
      payload.settings,
      childKnex,
      accountIdMap,
    );

    return {
      accountsCopied,
      taxRatesCopied,
      settingsCopied,
    };
  }

  private async copyAccounts(
    parentKnex: Knex,
    childKnex: Knex,
  ): Promise<{ accountIdMap: Map<number, number>; accountsCopied: number }> {
    const parentAccounts = await parentKnex('accounts').select('*');
    return this.copyAccountsFromRows(parentAccounts, childKnex);
  }

  private async copyAccountsFromRows(
    parentAccounts: Array<Record<string, unknown>>,
    childKnex: Knex,
  ): Promise<{ accountIdMap: Map<number, number>; accountsCopied: number }> {
    const accountIdMap = new Map<number, number>();
    let accountsCopied = 0;

    const childBefore = await childKnex('accounts').select('id', 'code', 'slug');
    const childByCode = new Map(
      childBefore.filter((a) => a.code).map((a) => [String(a.code), Number(a.id)]),
    );
    const childBySlug = new Map(
      childBefore.filter((a) => a.slug).map((a) => [String(a.slug), Number(a.id)]),
    );

    for (const row of parentAccounts) {
      const parentId = Number(row.id);
      const { id, ...rest } = row;

      const existingId =
        (rest.code && childByCode.get(String(rest.code))) ||
        (rest.slug && childBySlug.get(String(rest.slug))) ||
        null;

      if (existingId) {
        accountIdMap.set(parentId, existingId);
        continue;
      }

      if (!rest.code) {
        continue;
      }

      await childKnex('accounts').insert(rest).onConflict('code').ignore();
      const inserted = await childKnex('accounts')
        .where({ code: rest.code })
        .first('id');

      if (inserted) {
        const childId = Number(inserted.id);
        accountIdMap.set(parentId, childId);
        childByCode.set(String(rest.code), childId);
        if (rest.slug) {
          childBySlug.set(String(rest.slug), childId);
        }
        accountsCopied += 1;
      }
    }

    return { accountIdMap, accountsCopied };
  }

  private async copyTaxRates(parentKnex: Knex, childKnex: Knex): Promise<number> {
    const taxRates = await parentKnex('tax_rates').select('*');
    return this.copyTaxRatesFromRows(taxRates, childKnex);
  }

  private async copyTaxRatesFromRows(
    taxRates: Array<Record<string, unknown>>,
    childKnex: Knex,
  ): Promise<number> {
    const countBefore = (await childKnex('tax_rates').select('id')).length;

    for (const row of taxRates) {
      const { id, ...rest } = row;
      if (!rest.name) {
        continue;
      }
      await childKnex('tax_rates').insert(rest).onConflict('name').ignore();
    }

    const countAfter = (await childKnex('tax_rates').select('id')).length;

    return Math.max(0, countAfter - countBefore);
  }

  private async copyAccountSettings(
    parentKnex: Knex,
    childKnex: Knex,
    accountIdMap: Map<number, number>,
  ): Promise<number> {
    if (accountIdMap.size === 0) {
      return 0;
    }

    const parentSettings = (await parentKnex('settings').select('*')).filter((row) =>
      ACCOUNT_SETTING_KEYS.has(String(row.key)),
    );
    return this.copyAccountSettingsFromRows(parentSettings, childKnex, accountIdMap);
  }

  private async copyAccountSettingsFromRows(
    parentSettings: Array<Record<string, unknown>>,
    childKnex: Knex,
    accountIdMap: Map<number, number>,
  ): Promise<number> {
    if (accountIdMap.size === 0) {
      return 0;
    }

    let settingsCopied = 0;

    for (const row of parentSettings) {
      const parentAccountId = Number(row.value);
      const childAccountId = accountIdMap.get(parentAccountId);
      if (!childAccountId) {
        continue;
      }

      const { id, ...rest } = row;

      await childKnex('settings')
        .insert({ ...rest, value: childAccountId })
        .onConflict(['group', 'key'])
        .merge({ value: childAccountId });

      settingsCopied += 1;
    }

    return settingsCopied;
  }
}
