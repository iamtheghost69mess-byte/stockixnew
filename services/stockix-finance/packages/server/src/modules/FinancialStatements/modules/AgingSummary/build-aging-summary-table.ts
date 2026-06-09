import {
  IAgingPeriod,
  IAgingSummaryContact,
  IAgingSummaryData,
  IAgingSummaryTotal,
} from './AgingSummary.types';
import { AgingSummaryRowType } from './_constants';
import { tableRowMapper } from '../../utils/Table.utils';
import { ITableColumn, ITableRow } from '../../types/Table.types';

type BuildAgingSummaryTableOptions = {
  contactNameLabel: string;
  contactNameKey: string;
  contactNameAccessor: string;
};

function buildAgingColumns(periods: IAgingPeriod[]): ITableColumn[] {
  return periods.map((period) => ({
    label: `${period.beforeDays} - ${period.toDays || 'And Over'}`,
    key: 'aging_period',
  }));
}

function contactNodeAccessors(
  node: IAgingSummaryContact,
  contactNameKey: string,
  contactNameAccessor: string,
) {
  return [
    { key: contactNameKey, accessor: contactNameAccessor },
    { key: 'current', accessor: 'current.formattedAmount' },
    ...node.aging.map((_, index) => ({
      key: 'aging_period',
      accessor: `aging[${index}].total.formattedAmount`,
    })),
    { key: 'total', accessor: 'total.formattedAmount' },
  ];
}

function totalNodeAccessors(node: IAgingSummaryTotal) {
  return [
    { key: 'blank', value: '' },
    { key: 'current', accessor: 'current.formattedAmount' },
    ...node.aging.map((_, index) => ({
      key: 'aging_period',
      accessor: `aging[${index}].total.formattedAmount`,
    })),
    { key: 'total', accessor: 'total.formattedAmount' },
  ];
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

  const columns = indexColumns([
    { label: options.contactNameLabel, key: options.contactNameKey },
    { label: 'Current', key: 'current' },
    ...agingColumns,
    { label: 'Total', key: 'total' },
  ]);

  const rows = contacts.map((contact) =>
    tableRowMapper(
      contact,
      contactNodeAccessors(
        contact,
        options.contactNameKey,
        options.contactNameAccessor,
      ),
      { rowTypes: [AgingSummaryRowType.Contact] },
    ),
  );

  if (data.total) {
    rows.push(
      tableRowMapper(data.total, totalNodeAccessors(data.total), {
        rowTypes: [AgingSummaryRowType.Total],
      }),
    );
  }

  return { columns, rows };
}
