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

  if (sheet.items) {
    sheet.items.forEach((item) => {
      results.push(item);
    });
  }
  if (sheet.total) {
    results.push({
      row_types: 'total',
      ...sheet.total,
    });
  }
  return results;
};
