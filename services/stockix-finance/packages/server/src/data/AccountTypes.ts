export const ACCOUNT_TYPE = {
  CASH: 'cash',
  BANK: 'bank',
  CREDIT_CARD: 'credit_card',
  OTHER_CURRENT_ASSET: 'other_current_asset',
  FIXED_ASSET: 'fixed_asset',
  NON_CURRENT_ASSET: 'non_current_asset',
  ACCOUNTS_RECEIVABLE: 'accounts_receivable',
  INVENTORY: 'inventory',
  ACCOUNTS_PAYABLE: 'accounts_payable',
  OTHER_CURRENT_LIABILITY: 'other_current_liability',
  LOGN_TERM_LIABILITY: 'long_term_liability',
  NON_CURRENT_LIABILITY: 'non_current_liability',
  TAX_PAYABLE: 'tax_payable',
  EQUITY: 'equity',
  INCOME: 'income',
  OTHER_INCOME: 'other_income',
  COST_OF_GOODS_SOLD: 'cost_of_goods_sold',
  EXPENSE: 'expense',
  OTHER_EXPENSE: 'other_expense',
};

export const ACCOUNT_ROOT_TYPE = {
  ASSET: 'asset',
  LIABILITY: 'liability',
  EQUITY: 'equity',
  INCOME: 'income',
  EXPENSE: 'expense',
};

export const ACCOUNT_PARENT_TYPE = {
  CURRENT_ASSET: 'current_asset',
  FIXED_ASSET: 'fixed_asset',
  NON_CURRENT_ASSET: 'non_current_asset',
  CURRENT_LIABILITY: 'current_liability',
  NON_CURRENT_LIABILITY: 'non_current_liability',
  EXPENSE: 'expense',
  INCOME: 'income',
  EQUITY: 'equity',
};

export const ACCOUNT_NORMAL = {
  DEBIT: 'debit',
  CREDIT: 'credit',
};

export const ACCOUNT_TYPES = [
  { key: ACCOUNT_TYPE.CASH,                 label: 'Cash',                     normal: ACCOUNT_NORMAL.DEBIT,  rootType: ACCOUNT_ROOT_TYPE.ASSET,     parentType: ACCOUNT_PARENT_TYPE.CURRENT_ASSET,      balanceSheet: true,  incomeSheet: false, multiCurrency: true  },
  { key: ACCOUNT_TYPE.BANK,                 label: 'Bank',                     normal: ACCOUNT_NORMAL.DEBIT,  rootType: ACCOUNT_ROOT_TYPE.ASSET,     parentType: ACCOUNT_PARENT_TYPE.CURRENT_ASSET,      balanceSheet: true,  incomeSheet: false, multiCurrency: true  },
  { key: ACCOUNT_TYPE.CREDIT_CARD,          label: 'Credit Card',              normal: ACCOUNT_NORMAL.CREDIT, rootType: ACCOUNT_ROOT_TYPE.LIABILITY, parentType: ACCOUNT_PARENT_TYPE.CURRENT_LIABILITY,  balanceSheet: true,  incomeSheet: false, multiCurrency: true  },
  { key: ACCOUNT_TYPE.OTHER_CURRENT_ASSET,  label: 'Other Current Asset',      normal: ACCOUNT_NORMAL.DEBIT,  rootType: ACCOUNT_ROOT_TYPE.ASSET,     parentType: ACCOUNT_PARENT_TYPE.CURRENT_ASSET,      balanceSheet: true,  incomeSheet: false, multiCurrency: false },
  { key: ACCOUNT_TYPE.FIXED_ASSET,          label: 'Fixed Asset',              normal: ACCOUNT_NORMAL.DEBIT,  rootType: ACCOUNT_ROOT_TYPE.ASSET,     parentType: ACCOUNT_PARENT_TYPE.FIXED_ASSET,        balanceSheet: true,  incomeSheet: false, multiCurrency: false },
  { key: ACCOUNT_TYPE.NON_CURRENT_ASSET,    label: 'Non-Current Asset',        normal: ACCOUNT_NORMAL.DEBIT,  rootType: ACCOUNT_ROOT_TYPE.ASSET,     parentType: ACCOUNT_PARENT_TYPE.NON_CURRENT_ASSET,  balanceSheet: true,  incomeSheet: false, multiCurrency: false },
  { key: ACCOUNT_TYPE.ACCOUNTS_RECEIVABLE,  label: 'Accounts Receivable',      normal: ACCOUNT_NORMAL.DEBIT,  rootType: ACCOUNT_ROOT_TYPE.ASSET,     parentType: ACCOUNT_PARENT_TYPE.CURRENT_ASSET,      balanceSheet: true,  incomeSheet: false, multiCurrency: true  },
  { key: ACCOUNT_TYPE.INVENTORY,            label: 'Inventory',                normal: ACCOUNT_NORMAL.DEBIT,  rootType: ACCOUNT_ROOT_TYPE.ASSET,     parentType: ACCOUNT_PARENT_TYPE.CURRENT_ASSET,      balanceSheet: true,  incomeSheet: false, multiCurrency: false },
  { key: ACCOUNT_TYPE.ACCOUNTS_PAYABLE,     label: 'Accounts Payable',         normal: ACCOUNT_NORMAL.CREDIT, rootType: ACCOUNT_ROOT_TYPE.LIABILITY, parentType: ACCOUNT_PARENT_TYPE.CURRENT_LIABILITY,  balanceSheet: true,  incomeSheet: false, multiCurrency: true  },
  { key: ACCOUNT_TYPE.OTHER_CURRENT_LIABILITY, label: 'Other Current Liability', normal: ACCOUNT_NORMAL.CREDIT, rootType: ACCOUNT_ROOT_TYPE.LIABILITY, parentType: ACCOUNT_PARENT_TYPE.CURRENT_LIABILITY, balanceSheet: true, incomeSheet: false, multiCurrency: false },
  { key: ACCOUNT_TYPE.LOGN_TERM_LIABILITY,  label: 'Long-Term Liability',      normal: ACCOUNT_NORMAL.CREDIT, rootType: ACCOUNT_ROOT_TYPE.LIABILITY, parentType: ACCOUNT_PARENT_TYPE.NON_CURRENT_LIABILITY, balanceSheet: true, incomeSheet: false, multiCurrency: false },
  { key: ACCOUNT_TYPE.NON_CURRENT_LIABILITY, label: 'Non-Current Liability',   normal: ACCOUNT_NORMAL.CREDIT, rootType: ACCOUNT_ROOT_TYPE.LIABILITY, parentType: ACCOUNT_PARENT_TYPE.NON_CURRENT_LIABILITY, balanceSheet: true, incomeSheet: false, multiCurrency: false },
  { key: ACCOUNT_TYPE.TAX_PAYABLE,          label: 'Tax Payable',              normal: ACCOUNT_NORMAL.CREDIT, rootType: ACCOUNT_ROOT_TYPE.LIABILITY, parentType: ACCOUNT_PARENT_TYPE.CURRENT_LIABILITY,  balanceSheet: true,  incomeSheet: false, multiCurrency: false },
  { key: ACCOUNT_TYPE.EQUITY,               label: 'Equity',                   normal: ACCOUNT_NORMAL.CREDIT, rootType: ACCOUNT_ROOT_TYPE.EQUITY,    parentType: ACCOUNT_PARENT_TYPE.EQUITY,             balanceSheet: true,  incomeSheet: false, multiCurrency: false },
  { key: ACCOUNT_TYPE.INCOME,               label: 'Income',                   normal: ACCOUNT_NORMAL.CREDIT, rootType: ACCOUNT_ROOT_TYPE.INCOME,    parentType: ACCOUNT_PARENT_TYPE.INCOME,             balanceSheet: false, incomeSheet: true,  multiCurrency: false },
  { key: ACCOUNT_TYPE.OTHER_INCOME,         label: 'Other Income',             normal: ACCOUNT_NORMAL.CREDIT, rootType: ACCOUNT_ROOT_TYPE.INCOME,    parentType: ACCOUNT_PARENT_TYPE.INCOME,             balanceSheet: false, incomeSheet: true,  multiCurrency: false },
  { key: ACCOUNT_TYPE.COST_OF_GOODS_SOLD,   label: 'Cost of Goods Sold',       normal: ACCOUNT_NORMAL.DEBIT,  rootType: ACCOUNT_ROOT_TYPE.EXPENSE,   parentType: ACCOUNT_PARENT_TYPE.EXPENSE,            balanceSheet: false, incomeSheet: true,  multiCurrency: false },
  { key: ACCOUNT_TYPE.EXPENSE,              label: 'Expense',                  normal: ACCOUNT_NORMAL.DEBIT,  rootType: ACCOUNT_ROOT_TYPE.EXPENSE,   parentType: ACCOUNT_PARENT_TYPE.EXPENSE,            balanceSheet: false, incomeSheet: true,  multiCurrency: false },
  { key: ACCOUNT_TYPE.OTHER_EXPENSE,        label: 'Other Expense',            normal: ACCOUNT_NORMAL.DEBIT,  rootType: ACCOUNT_ROOT_TYPE.EXPENSE,   parentType: ACCOUNT_PARENT_TYPE.EXPENSE,            balanceSheet: false, incomeSheet: true,  multiCurrency: false },
];

export function getAccountsSupportsMultiCurrency() {
  return ACCOUNT_TYPES.filter((type) => type.multiCurrency);
}
