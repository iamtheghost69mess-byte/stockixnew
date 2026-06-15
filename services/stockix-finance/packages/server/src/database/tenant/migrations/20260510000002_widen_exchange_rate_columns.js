/**
 * Widen all exchange_rate columns from decimal(13,9) to decimal(15,4).
 * decimal(13,9) limits the integer part to 4 digits (max 9999), which
 * overflows for high-value currencies like LBP (~89 000 per USD).
 * decimal(15,4) supports up to 99 999 999 999.9999.
 */
exports.up = async (knex) => {
  const tables = [
    'sales_invoices',
    'sales_estimates',
    'sales_receipts',
    'payment_receives',
    'bills',
    'bills_payments',
    'credit_notes',
    'vendor_credits',
    'accounts_transactions',
    'manual_journals',
    'cashflow_transactions',
    'expenses_transactions',
    'refund_credit_note_transactions',
    'refund_vendor_credit_transactions',
    'bill_located_costs',
  ];

  for (const table of tables) {
    await knex.schema.alterTable(table, (t) => {
      t.decimal('exchange_rate', 15, 4).notNullable().defaultTo(1).alter();
    });
  }

  await knex.schema.alterTable('contacts', (t) => {
    t.decimal('opening_balance_exchange_rate', 15, 4).nullable().alter();
  });

  await knex.schema.alterTable('exchange_rates', (t) => {
    t.decimal('exchange_rate', 15, 4).notNullable().alter();
  });
};

exports.down = async (knex) => {
  const tables = [
    'sales_invoices', 'sales_estimates', 'sales_receipts',
    'payment_receives', 'bills', 'bills_payments', 'credit_notes',
    'vendor_credits', 'accounts_transactions', 'manual_journals',
    'cashflow_transactions', 'expenses_transactions',
    'refund_credit_note_transactions', 'refund_vendor_credit_transactions',
    'bill_located_costs',
  ];
  for (const table of tables) {
    await knex.schema.alterTable(table, (t) => {
      t.decimal('exchange_rate', 13, 9).notNullable().defaultTo(1).alter();
    });
  }
  await knex.schema.alterTable('contacts', (t) => {
    t.decimal('opening_balance_exchange_rate', 13, 9).nullable().alter();
  });
  await knex.schema.alterTable('exchange_rates', (t) => {
    t.decimal('exchange_rate', 13, 9).notNullable().alter();
  });
};
