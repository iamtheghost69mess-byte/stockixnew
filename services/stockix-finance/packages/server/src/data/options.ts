/**
 * Declares built-in setting keys grouped by domain (used by Option validation and Metable metadata).
 * Upstream BigCapital historically kept this out of git via a broad `data` ignore; Docker builds need it on disk.
 *
 * Extend with real groups/keys as needed; migrations that only touch schema run fine with a minimal object.
 */
const options: Record<
  string,
  Array<{ key: string; config?: boolean; type?: string }>
> = {
  organization: [
    { key: 'accounting_basis', type: 'string' }
  ],
  accounts: [
    { key: 'account_code_required', type: 'boolean' },
    { key: 'account_code_unique', type: 'boolean' }
  ],
  bill_payments: [
    { key: 'withdrawal_account', type: 'number' },
    { key: 'withdrawalAccount', type: 'number' }
  ],
  payment_receives: [
    { key: 'preferred_deposit_account', type: 'number' },
    { key: 'preferred_advance_deposit', type: 'number' },
    { key: 'number_prefix', type: 'string' },
    { key: 'next_number', type: 'string' },
    { key: 'auto_increment', type: 'boolean' }
  ],
  items: [
    { key: 'preferred_sell_account', type: 'number' },
    { key: 'preferred_cost_account', type: 'number' },
    { key: 'preferred_inventory_account', type: 'number' }
  ],
  manual_journals: [
    { key: 'next_number', type: 'string' },
    { key: 'auto_increment', type: 'boolean' }
  ],
  sales_invoices: [
    { key: 'next_number', type: 'string' },
    { key: 'number_prefix', type: 'string' },
    { key: 'auto_increment', type: 'boolean' }
  ],
  sales_receipts: [
    { key: 'next_number', type: 'string' },
    { key: 'number_prefix', type: 'string' },
    { key: 'auto_increment', type: 'boolean' }
  ],
  sales_estimates: [
    { key: 'next_number', type: 'string' },
    { key: 'number_prefix', type: 'string' },
    { key: 'auto_increment', type: 'boolean' }
  ],
  cashflow: [
    { key: 'number_prefix', type: 'string' },
    { key: 'next_number', type: 'string' },
    { key: 'auto_increment', type: 'boolean' }
  ],
  warehouse_transfers: [
    { key: 'next_number', type: 'string' },
    { key: 'number_prefix', type: 'string' },
    { key: 'auto_increment', type: 'boolean' }
  ],
  credit_note: [
    { key: 'number_prefix', type: 'string' },
    { key: 'next_number', type: 'string' },
    { key: 'auto_increment', type: 'boolean' }
  ],
  vendor_credit: [
    { key: 'number_prefix', type: 'string' },
    { key: 'next_number', type: 'string' },
    { key: 'auto_increment', type: 'boolean' }
  ]
};

export default options;
