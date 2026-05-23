import BalanceSheetTable from '@/services/FinancialStatements/BalanceSheet/BalanceSheetTable';
import { ProfitLossSheetTable } from '@/services/FinancialStatements/ProfitLossSheet/ProfitLossSheetTable';
import CashFlowTable from '@/services/FinancialStatements/CashFlow/CashFlowTable';

const i18n = { __: (k: string) => k };

// ───────────────────────────────── helpers ──────────────────────────────────

const baseQuery = { displayColumnsType: 'total' };
const basePLQuery = { displayColumnsType: 'total', basis: 'accrual' };
const emptyCFReport = {
  data: [],
  query: { fromDate: new Date(), toDate: new Date(), displayColumnsType: 'total', displayColumnsBy: 'month' },
  meta: {},
};

function findColumn(columns: any[], key: string): any {
  for (const col of columns) {
    if (col.key === key) return col;
    if (col.children) {
      const found = findColumn(col.children, key);
      if (found) return found;
    }
  }
  return null;
}

// ─────────────────────────── BalanceSheetTable ──────────────────────────────

describe('BalanceSheetTable — secondary currency column', () => {
  it('does NOT include secondary_total column when no secondary currency set', () => {
    const table = new BalanceSheetTable([] as any, baseQuery as any, i18n, 'USD');
    const columns = table.tableColumns();
    expect(findColumn(columns, 'secondary_total')).toBeNull();
  });

  it('does NOT include secondary_total column when rate is zero', () => {
    const table = new BalanceSheetTable([] as any, baseQuery as any, i18n, 'USD', 'EUR', 0);
    const columns = table.tableColumns();
    expect(findColumn(columns, 'secondary_total')).toBeNull();
  });

  it('includes secondary_total column when secondary currency and rate are set', () => {
    const table = new BalanceSheetTable([] as any, baseQuery as any, i18n, 'USD', 'EUR', 1.08);
    const columns = table.tableColumns();
    expect(findColumn(columns, 'secondary_total')).not.toBeNull();
  });

  it('secondary_total column label contains the secondary currency code', () => {
    const table = new BalanceSheetTable([] as any, baseQuery as any, i18n, 'USD', 'EUR', 1.08);
    const col = findColumn(table.tableColumns(), 'secondary_total');
    expect(col.label).toContain('EUR');
  });

  it('secondary cell value = total.amount × rate (formatted)', () => {
    const node = {
      nodeType: 'ACCOUNT',
      id: 1,
      name: 'Cash',
      total: { amount: 1000, formattedAmount: '$1,000.00' },
      children: [],
    };
    const table = new BalanceSheetTable([node] as any, baseQuery as any, i18n, 'USD', 'EUR', 1.08);
    const rows = table.tableRows();
    const secCell = rows[0]?.cells?.find((c: any) => c.key === 'secondary_total');
    expect(secCell?.value).toContain('1,080');
  });

  it('leaves secondary cell empty when node has no total.amount', () => {
    const node = {
      nodeType: 'ACCOUNT',
      id: 2,
      name: 'No Total',
      total: { amount: null, formattedAmount: '' },
      children: [],
    };
    const table = new BalanceSheetTable([node] as any, baseQuery as any, i18n, 'USD', 'EUR', 1.08);
    const rows = table.tableRows();
    const secCell = rows[0]?.cells?.find((c: any) => c.key === 'secondary_total');
    expect(secCell?.value ?? '').toBe('');
  });
});

// ─────────────────────────── ProfitLossSheetTable ───────────────────────────

describe('ProfitLossSheetTable — secondary currency column', () => {
  it('excludes secondary_total when not configured', () => {
    const table = new ProfitLossSheetTable([], basePLQuery as any, i18n, 'USD');
    expect(findColumn(table.tableColumns(), 'secondary_total')).toBeNull();
  });

  it('includes secondary_total when configured', () => {
    const table = new ProfitLossSheetTable([], basePLQuery as any, i18n, 'USD', 'EUR', 1.08);
    expect(findColumn(table.tableColumns(), 'secondary_total')).not.toBeNull();
  });
});

// ───────────────────────────────── CashFlowTable ────────────────────────────

describe('CashFlowTable — secondary currency column', () => {
  it('excludes secondary_total when not configured', () => {
    const table = new CashFlowTable(emptyCFReport as any, i18n, 'USD');
    expect(findColumn(table.tableColumns(), 'secondary_total')).toBeNull();
  });

  it('includes secondary_total when configured', () => {
    const table = new CashFlowTable(emptyCFReport as any, i18n, 'USD', 'EUR', 1.08);
    expect(findColumn(table.tableColumns(), 'secondary_total')).not.toBeNull();
  });

  it('secondary_total column label contains the secondary currency code', () => {
    const table = new CashFlowTable(emptyCFReport as any, i18n, 'USD', 'EUR', 1.08);
    const col = findColumn(table.tableColumns(), 'secondary_total');
    expect(col.label).toContain('EUR');
  });
});
