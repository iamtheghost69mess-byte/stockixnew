// @ts-nocheck
import { BillPdfTemplateAttributes } from './Bills.types';
import { contactAddressTextFormat } from '@/utils/address-text-format';

export const transformBillToPdfTemplate = (
  bill: Record<string, any>,
): Partial<BillPdfTemplateAttributes> => {
  return {
    billDate: bill.formattedBillDate,
    dueDate: bill.formattedDueDate,
    billNumber: bill.billNumber,

    total: bill.totalFormatted ?? bill.formattedAmount,
    subtotal: bill.subtotalFormatted,

    lines: bill.entries?.map((entry) => ({
      item: entry.item.name,
      description: entry.description,
      rate: entry.rateFormatted,
      quantity: entry.quantityFormatted,
      total: entry.totalFormatted,
    })),
    billNote: bill.note,
    vendorAddress: contactAddressTextFormat(bill.vendor),
  };
};
