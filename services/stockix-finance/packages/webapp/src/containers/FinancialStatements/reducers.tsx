// @ts-nocheck

export const trialBalanceSheetReducer = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const results = [];
  if (data.accounts) data.accounts.forEach((a) => results.push(a));
  if (data.total) results.push({ row_types: 'total', ...data.total });
  return results;
};

export const purchasesByItemsReducer = (sheet) => {
  const results = [];
  if (sheet?.items) sheet.items.forEach((item) => results.push(item));
  if (sheet?.total) results.push({ row_types: 'total', ...sheet.total });
  return results;
};

export const salesByItemsReducer = (sheet) => {
  const results = [];
  if (sheet?.items) sheet.items.forEach((item) => results.push(item));
  if (sheet?.total) results.push({ row_types: 'total', ...sheet.total });
  return results;
};

export const generalLedgerTableRowsReducer = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const results = [];
  const walk = (node) => {
    if (!node) return;
    results.push(node);
    if (node.transactions) node.transactions.forEach((t) => results.push(t));
    if (node.children) node.children.forEach(walk);
  };
  if (data.accounts) data.accounts.forEach(walk);
  if (data.closing_balance) results.push({ row_types: 'closing_balance', ...data.closing_balance });
  return results;
};

export const journalTableRowsReducer = (entries) => {
  if (!entries) return [];
  if (Array.isArray(entries)) return entries;
  return [];
};

export const ARAgingSummaryTableRowsMapper = ({ customers, total, columns }) => {
  const results = [];
  if (customers) customers.forEach((c) => results.push({ ...c, columns }));
  if (total) results.push({ row_types: 'total', ...total, columns });
  return results;
};

export const APAgingSummaryTableRowsMapper = ({ vendors, total, columns }) => {
  const results = [];
  if (vendors) vendors.forEach((v) => results.push({ ...v, columns }));
  if (total) results.push({ row_types: 'total', ...total, columns });
  return results;
};

export const inventoryValuationReducer = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const results = [];
  if (data.items) data.items.forEach((item) => results.push(item));
  if (data.total) results.push({ row_types: 'total', ...data.total });
  return results;
};
