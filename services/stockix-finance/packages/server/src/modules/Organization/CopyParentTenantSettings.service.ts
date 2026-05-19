import { Injectable } from '@nestjs/common';
import { TenantKnexFactory } from '@/modules/Tenancy/TenantKnexFactory';

@Injectable()
export class CopyParentTenantSettingsService {
  constructor(private readonly tenantKnexFactory: TenantKnexFactory) {}

  /**
   * Copies chart of accounts and tax rates from parent tenant DB to child tenant DB.
   */
  async copyFromParent(
    tenantId: number,
    parentTenantId: number,
  ): Promise<{ accountsCopied: number; taxRatesCopied: number }> {
    const parentKnex = await this.tenantKnexFactory.getKnexForTenantId(parentTenantId);
    const childKnex = await this.tenantKnexFactory.getKnexForTenantId(tenantId);

    const accounts = await parentKnex('accounts').select('*');
    const accountsToInsert = accounts.map(({ id, ...rest }) => rest);

    let accountsCopied = 0;
    if (accountsToInsert.length > 0) {
      for (const row of accountsToInsert) {
        const existing = row.code
          ? await childKnex('accounts').where({ code: row.code }).first()
          : null;
        if (!existing) {
          await childKnex('accounts').insert(row);
          accountsCopied += 1;
        }
      }
    }

    const taxRates = await parentKnex('tax_rates').select('*');
    const taxRatesToInsert = taxRates.map(({ id, ...rest }) => rest);

    let taxRatesCopied = 0;
    if (taxRatesToInsert.length > 0) {
      for (const row of taxRatesToInsert) {
        const existing = row.name
          ? await childKnex('tax_rates').where({ name: row.name }).first()
          : null;
        if (!existing) {
          await childKnex('tax_rates').insert(row);
          taxRatesCopied += 1;
        }
      }
    }

    return { accountsCopied, taxRatesCopied };
  }
}
