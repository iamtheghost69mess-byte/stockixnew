const AccountsData = [
  // Cash & Bank
  { name: 'Petty Cash',              description: 'Petty cash fund for small expenses',         accountType: 'cash',                  code: '1010', predefined: true },
  { name: 'Cash On Hand',            description: 'Cash on hand',                               accountType: 'cash',                  code: '1020', predefined: true },
  { name: 'Checking Account',        description: 'Primary business checking account',           accountType: 'bank',                  code: '1100', predefined: true },
  { name: 'Savings Account',         description: 'Business savings account',                   accountType: 'bank',                  code: '1110', predefined: true },

  // Current Assets
  { name: 'Accounts Receivable',     description: 'Amounts owed by customers',                  accountType: 'accounts_receivable',   code: '1200', predefined: true },
  { name: 'Inventory',               description: 'Goods held for sale',                        accountType: 'inventory',             code: '1300', predefined: true },
  { name: 'Prepaid Expenses',        description: 'Expenses paid in advance',                   accountType: 'other_current_asset',   code: '1400', predefined: true },
  { name: 'Other Current Assets',    description: 'Other short-term assets',                    accountType: 'other_current_asset',   code: '1490', predefined: true },

  // Fixed & Non-Current Assets
  { name: 'Furniture & Equipment',   description: 'Office furniture and equipment',             accountType: 'fixed_asset',           code: '1500', predefined: true },
  { name: 'Vehicles',                description: 'Company-owned vehicles',                     accountType: 'fixed_asset',           code: '1510', predefined: true },
  { name: 'Accumulated Depreciation',description: 'Accumulated depreciation on fixed assets',  accountType: 'fixed_asset',           code: '1590', predefined: true },
  { name: 'Non-Current Assets',      description: 'Long-term assets not classified elsewhere',  accountType: 'non_current_asset',     code: '1600', predefined: true },

  // Current Liabilities
  { name: 'Accounts Payable',        description: 'Amounts owed to suppliers and vendors',      accountType: 'accounts_payable',      code: '2000', predefined: true },
  { name: 'Credit Card',             description: 'Business credit card balance',               accountType: 'credit_card',           code: '2010', predefined: true },
  { name: 'Accrued Liabilities',     description: 'Expenses incurred but not yet paid',         accountType: 'other_current_liability',code: '2100', predefined: true },
  { name: 'Deferred Revenue',        description: 'Revenue received but not yet earned',        accountType: 'other_current_liability',code: '2110', predefined: true },
  { name: 'Tax Payable',             description: 'Taxes owed to government authorities',       accountType: 'tax_payable',           code: '2200', predefined: true },
  { name: 'Sales Tax Payable',       description: 'Sales tax collected from customers',         accountType: 'tax_payable',           code: '2210', predefined: true },
  { name: 'Other Current Liabilities',description: 'Other short-term obligations',             accountType: 'other_current_liability',code: '2490', predefined: true },

  // Long-Term Liabilities
  { name: 'Long-Term Loan',          description: 'Loans payable beyond one year',              accountType: 'long_term_liability',   code: '2500', predefined: true },
  { name: 'Non-Current Liabilities', description: 'Other long-term obligations',               accountType: 'non_current_liability', code: '2600', predefined: true },

  // Equity
  { name: 'Owner\'s Equity',         description: 'Owner\'s investment in the business',        accountType: 'equity',                code: '3000', predefined: true },
  { name: 'Retained Earnings',       description: 'Accumulated profits retained in the business',accountType: 'equity',               code: '3100', predefined: true },
  { name: 'Owner\'s Drawings',       description: 'Owner withdrawals from the business',        accountType: 'equity',                code: '3200', predefined: true },

  // Income
  { name: 'Sales Revenue',           description: 'Revenue from primary business operations',   accountType: 'income',                code: '4000', predefined: true },
  { name: 'Service Revenue',         description: 'Revenue from services rendered',             accountType: 'income',                code: '4010', predefined: true },
  { name: 'Other Income',            description: 'Income from non-primary business activities',accountType: 'other_income',          code: '4100', predefined: true },
  { name: 'Interest Income',         description: 'Interest earned on bank accounts and loans', accountType: 'other_income',          code: '4110', predefined: true },

  // Cost of Goods Sold
  { name: 'Cost of Goods Sold',      description: 'Direct cost of goods sold',                 accountType: 'cost_of_goods_sold',    code: '5000', predefined: true },
  { name: 'Freight & Shipping',      description: 'Shipping costs for goods purchased or sold', accountType: 'cost_of_goods_sold',    code: '5010', predefined: true },

  // Expenses
  { name: 'Rent Expense',            description: 'Office or business premises rent',           accountType: 'expense',               code: '6000', predefined: true },
  { name: 'Salaries & Wages',        description: 'Employee compensation and wages',            accountType: 'expense',               code: '6010', predefined: true },
  { name: 'Utilities Expense',       description: 'Electricity, water, and utility costs',      accountType: 'expense',               code: '6020', predefined: true },
  { name: 'Telephone & Internet',    description: 'Phone and internet service costs',           accountType: 'expense',               code: '6030', predefined: true },
  { name: 'Insurance Expense',       description: 'Business insurance premiums',                accountType: 'expense',               code: '6040', predefined: true },
  { name: 'Depreciation Expense',    description: 'Periodic depreciation on fixed assets',      accountType: 'expense',               code: '6050', predefined: true },
  { name: 'Office Supplies',         description: 'Office stationery and supplies',             accountType: 'expense',               code: '6060', predefined: true },
  { name: 'Advertising & Marketing', description: 'Advertising and marketing costs',            accountType: 'expense',               code: '6070', predefined: true },
  { name: 'Travel & Entertainment',  description: 'Business travel and entertainment',          accountType: 'expense',               code: '6080', predefined: true },
  { name: 'Professional Fees',       description: 'Legal, accounting, and consulting fees',     accountType: 'expense',               code: '6090', predefined: true },
  { name: 'Bank Charges',            description: 'Bank service fees and charges',              accountType: 'expense',               code: '6100', predefined: true },
  { name: 'Interest Expense',        description: 'Interest paid on loans and credit',          accountType: 'expense',               code: '6110', predefined: true },
  { name: 'General Expenses',        description: 'Miscellaneous business expenses',            accountType: 'expense',               code: '6490', predefined: true },

  // Other Expenses
  { name: 'Other Expenses',          description: 'Expenses not classified elsewhere',          accountType: 'other_expense',         code: '6900', predefined: true },
  { name: 'Loss on Asset Disposal',  description: 'Losses from disposal of assets',            accountType: 'other_expense',         code: '6910', predefined: true },
];

export default AccountsData;
