import { CopyParentTenantSettingsService } from './CopyParentTenantSettings.service';

function createKnexMock(
  tables: Record<string, Array<Record<string, unknown>>>,
) {
  const store = { ...tables };

  const buildChain = (table: string) => {
    const chain: {
      select: (...args: unknown[]) => typeof chain;
      where: (criteria: Record<string, unknown>) => typeof chain;
      first: (
        ...columns: string[]
      ) => Promise<Record<string, unknown> | undefined>;
      insert: (row: Record<string, unknown> | Array<Record<string, unknown>>) => {
        onConflict: (cols: string | string[]) => {
          ignore: () => Promise<number[]>;
          merge: (patch: Record<string, unknown>) => Promise<number[]>;
        };
      };
      then: (
        resolve: (rows: Array<Record<string, unknown>>) => void,
        reject?: (err: unknown) => void,
      ) => void;
      _where: Record<string, unknown>;
      _table: string;
      _mergeConflict?: string | string[];
      _mergeRow?: Record<string, unknown>;
    } = {
      _table: table,
      _where: {},
      select: () => chain,
      where: (criteria: Record<string, unknown>) => {
        chain._where = criteria;
        return chain;
      },
      first: async (...columns: string[]) => {
        const rows = store[table] ?? [];
        const match = rows.find((r) =>
          Object.entries(chain._where ?? {}).every(([k, v]) => r[k] === v),
        );
        if (!match) return undefined;
        if (columns.length === 1 && columns[0] === 'id') {
          return { id: match.id };
        }
        return match;
      },
      insert: (
        row: Record<string, unknown> | Array<Record<string, unknown>>,
      ) => ({
        onConflict: (cols: string | string[]) => {
          chain._mergeConflict = cols;
          chain._mergeRow = Array.isArray(row) ? row[0] : row;
          return {
          ignore: async () => {
            const rows = Array.isArray(row) ? row : [row];
            if (!store[table]) {
              store[table] = [];
            }
            for (const r of rows) {
              const id = store[table].length + 100;
              store[table].push({ ...r, id });
            }
            return [100];
          },
          merge: async (patch: Record<string, unknown>) => {
            if (!store[table]) {
              store[table] = [];
            }
            const rows = store[table];
            const conflictKey = chain._mergeConflict;
            const match = rows.find((r) => {
              if (!conflictKey) {
                return false;
              }
              const keys = Array.isArray(conflictKey)
                ? conflictKey
                : [conflictKey];
              return keys.every((k) => r[k] === chain._mergeRow?.[k]);
            });
            if (match) {
              Object.assign(match, patch);
            } else if (chain._mergeRow) {
              const id = rows.length + 100;
              rows.push({ ...chain._mergeRow, ...patch, id });
            }
            return [100];
          },
        };
        },
      }),
      then: (resolve) => {
        const rows = store[table] ?? [];
        if (Object.keys(chain._where).length > 0) {
          resolve(
            rows.filter((r) =>
              Object.entries(chain._where).every(([k, v]) => r[k] === v),
            ),
          );
          return;
        }
        resolve(rows);
      },
    };
    return chain;
  };

  const knexFn = (table: string) => buildChain(table);

  return knexFn as unknown as import('knex').Knex;
}

describe('CopyParentTenantSettingsService', () => {
  it('remaps account-pointer settings to child account ids', async () => {
    const parentAccounts = [
      { id: 10, slug: 'inventory-asset', code: '1200' },
      { id: 11, slug: 'sales-income', code: '4000' },
    ];
    const childAccounts = [
      { id: 210, slug: 'inventory-asset', code: '1200' },
      { id: 211, slug: 'sales-income', code: '4000' },
    ];
    const parentSettings = [
      {
        id: 1,
        group: 'items',
        key: 'preferred_inventory_account',
        value: 10,
        type: 'number',
        user_id: null,
      },
    ];

    const childSettings: Array<Record<string, unknown>> = [];

    const parentKnex = createKnexMock({
      accounts: [...parentAccounts],
      tax_rates: [],
      settings: [...parentSettings],
    });

    const childKnex = createKnexMock({
      accounts: [...childAccounts],
      tax_rates: [],
      settings: childSettings,
    });

    const factory = {
      getKnexForTenantId: async (tenantId: number) =>
        tenantId === 1 ? parentKnex : childKnex,
    };

    const service = new CopyParentTenantSettingsService(factory as never);
    const result = await service.copyFromParent(2, 1);

    expect(result.settingsCopied).toBe(1);
    expect(childSettings[0]?.value).toBe(210);
    expect(childSettings[0]?.key).toBe('preferred_inventory_account');
  });

  it('imports exported chart of accounts payload into child tenant', async () => {
    const parentAccounts = [
      { id: 10, slug: 'inventory-asset', code: '1200', name: 'Inventory' },
      { id: 11, slug: 'sales-income', code: '4000', name: 'Sales' },
    ];
    const childAccounts: Array<Record<string, unknown>> = [];
    const childSettings: Array<Record<string, unknown>> = [];
    const parentSettings = [
      {
        id: 1,
        group: 'items',
        key: 'preferred_inventory_account',
        value: 10,
        type: 'number',
        user_id: null,
      },
    ];

    const childKnex = createKnexMock({
      accounts: childAccounts,
      tax_rates: [],
      settings: childSettings,
    });

    const factory = {
      getKnexForTenantId: async () => childKnex,
    };

    const service = new CopyParentTenantSettingsService(factory as never);
    const result = await service.importChartOfAccounts(2, {
      accounts: parentAccounts,
      taxRates: [],
      settings: parentSettings,
    });

    expect(result.accountsCopied).toBe(2);
    expect(result.settingsCopied).toBe(1);
    expect(childSettings[0]?.value).toBeGreaterThan(0);
  });
});
