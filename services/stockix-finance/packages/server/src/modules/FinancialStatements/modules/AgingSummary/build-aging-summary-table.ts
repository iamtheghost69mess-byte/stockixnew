import {
  IAgingPeriod,
  IAgingSummaryContact,
  IAgingSummaryData,
  IAgingSummaryTotal,
} from './AgingSummary.types';
import { AgingSummaryRowType } from './_constants';
import { tableRowMapper } from '../../utils/Table.utils';
import { ITableColumn, ITableRow } from '../../types/Table.types';
import { formatNumber } from '@/utils/format-number';

type BuildAgingSummaryTableOptions = {
  contactNameLabel: string;
  contactNameKey: string;
  contactNameAccessor: string;
  secondaryCurrency?: string;
  secondaryRate?: number;
};

function buildAgingColumns(periods: IAgingPeriod[]): ITableColumn[] {
  return periods.map((period) => ({
    label: `${period.beforeDays} - ${period.toDays || 'And Over'}`,
    key: 'aging_period',
  }));
}

function formatSecondary(amount: number, currencyCode: string): string {
  return formatNumber(amount, { money: true, currencyCode, precision: 2 });
}

function decorateWithSecondary(node: any, amount: number, secondaryCurrency: string, secondaryRate: number): any {
  return {
    ...node,
    secondary: {
      formattedAmount: formatSecondary(amount * secondaryRate, secondaryCurrency),
    },
  };
}

function contactNodeAccessors(
  node: IAgingSummaryContact,
  contactNameKey: string,
  contactNameAccessor: string,
  hasSecondary: boolean,
) {
  const accessors: any[] = [
    { key: contactNameKey, accessor: contactNameAccessor },
    { key: 'current', accessor: 'current.formattedAmount' },
    ...node.aging.map((_, index) => ({
      key: 'aging_period',
      accessor: `aging[${index}].total.formattedAmount`,
    })),
    { key: 'total', accessor: 'total.formattedAmount' },
  ];
  if (hasSecondary) {
    accessors.push({ key: 'secondary_total', accessor: 'secondary.formattedAmount' });
  }
  return accessors;
}

function totalNodeAccessors(node: IAgingSummaryTotal, hasSecondary: boolean) {
  const accessors: any[] = [
    { key: 'blank', value: '' },
    { key: 'current', accessor: 'current.formattedAmount' },
    ...node.aging.map((_, index) => ({
      key: 'aging_period',
      accessor: `aging[${index}].total.formattedAmount`,
    })),
    { key: 'total', accessor: 'total.formattedAmount' },
  ];
  if (hasSecondary) {
    accessors.push({ key: 'secondary_total', accessor: 'secondary.formattedAmount' });
  }
  return accessors;
}

function indexColumns(columns: ITableColumn[]): ITableColumn[] {
  return columns.map((column, index) => ({ ...column, cellIndex: index }));
}

export function buildAgingSummaryTable(
  data: IAgingSummaryData & { customers?: IAgingSummaryContact[]; vendors?: IAgingSummaryContact[] },
  periods: IAgingPeriod[],
  options: BuildAgingSummaryTableOptions,
): { columns: ITableColumn[]; rows: ITableRow[] } {
  const contacts = data.customers ?? data.vendors ?? [];
  const agingColumns = buildAgingColumns(periods);
  const hasSecondary = !!(options.secondaryCurrency && options.secondaryRate);

  const columnDefs: ITableColumn[] = [
    { label: options.contactNameLabel, key: options.contactNameKey },
    { label: 'Current', key: 'current' },
    ...agingColumns,
    { label: 'Total', key: 'total' },
  ];
  if (hasSecondary) {
    columnDefs.push({ label: `≈ ${options.secondaryCurrency} Total`, key: 'secondary_total' });
  }
  const columns = indexColumns(columnDefs);

  const rows = contacts.map((contact) => {
    const decorated = hasSecondary
      ? decorateWithSecondary(contact, contact.total.amount, options.secondaryCurrency!, options.secondaryRate!)
      : contact;
    return tableRowMapper(
      decorated,
      contactNodeAccessors(contact, options.contactNameKey, options.contactNameAccessor, hasSecondary),
      { rowTypes: [AgingSummaryRowType.Contact] },
    );
  });

  if (data.total) {
    const decoratedTotal = hasSecondary
      ? decorateWithSecondary(data.total, data.total.total.amount, options.secondaryCurrency!, options.secondaryRate!)
      : data.total;
    rows.push(
      tableRowMapper(decoratedTotal, totalNodeAccessors(data.total, hasSecondary), {
        rowTypes: [AgingSummaryRowType.Total],
      }),
    );
  }

  return { columns, rows };
}
