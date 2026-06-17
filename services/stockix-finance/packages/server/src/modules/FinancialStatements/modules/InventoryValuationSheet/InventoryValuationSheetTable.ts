import * as R from 'ramda';
import {
  IInventoryValuationItem,
  IInventoryValuationSheetData,
  IInventoryValuationTotal,
} from './InventoryValuationSheet.types';
import { ROW_TYPE } from './_constants';
import { FinancialTable } from '../../common/FinancialTable';
import { FinancialSheetStructure } from '../../common/FinancialSheetStructure';
import { FinancialSheet } from '../../common/FinancialSheet';
import {
  ITableColumn,
  ITableColumnAccessor,
  ITableRow,
} from '../../types/Table.types';
import { tableRowMapper } from '../../utils/Table.utils';

export class InventoryValuationSheetTable extends R.pipe(
  FinancialTable,
  FinancialSheetStructure,
)(FinancialSheet) {
  private readonly data: IInventoryValuationSheetData;
  private readonly secondaryCurrency: string;
  private readonly secondaryRate: number;

  constructor(data: IInventoryValuationSheetData, secondaryCurrency?: string, secondaryRate?: number) {
    super();
    this.data = data;
    this.secondaryCurrency = secondaryCurrency ?? '';
    this.secondaryRate = secondaryRate ?? 0;
  }

  private commonColumnsAccessors(): ITableColumnAccessor[] {
    const accessors: any[] = [
      { key: 'item_name', accessor: 'name' },
      { key: 'quantity', accessor: 'quantityFormatted' },
      { key: 'valuation', accessor: 'valuationFormatted' },
      { key: 'average', accessor: 'averageFormatted' },
    ];
    if (this.secondaryCurrency && this.secondaryRate) {
      accessors.push({ key: 'secondary_valuation', accessor: 'secondary.formattedAmount' });
    }
    return accessors;
  }

  private decorateSecondary = (node: IInventoryValuationItem | IInventoryValuationTotal): any => {
    if (!this.secondaryCurrency || !this.secondaryRate) return node;
    return {
      ...node,
      secondary: {
        formattedAmount: this.formatTotalNumber(node.valuation * this.secondaryRate, {
          currencyCode: this.secondaryCurrency,
        }),
      },
    };
  };

  private totalRowMapper = (total: IInventoryValuationTotal): ITableRow => {
    return tableRowMapper(this.decorateSecondary(total), this.commonColumnsAccessors(), {
      rowTypes: [ROW_TYPE.TOTAL],
    });
  };

  private itemRowMapper = (item: IInventoryValuationItem): ITableRow => {
    return tableRowMapper(this.decorateSecondary(item), this.commonColumnsAccessors(), {
      rowTypes: [ROW_TYPE.ITEM],
    });
  };

  private itemsRowsMapper = (items: IInventoryValuationItem[]): ITableRow[] => {
    return R.map(this.itemRowMapper)(items);
  };

  public tableRows(): ITableRow[] {
    const itemsRows = this.itemsRowsMapper(this.data.items);
    const totalRow = this.totalRowMapper(this.data.total);

    return R.compose(
      R.when(R.always(R.not(R.isEmpty(itemsRows))), R.append(totalRow)),
    )([...itemsRows]) as ITableRow[];
  }

  public tableColumns(): ITableColumn[] {
    const columns: any[] = [
      { key: 'item_name', label: 'Item Name' },
      { key: 'quantity', label: 'Quantity' },
      { key: 'valuation', label: 'Valuation' },
      { key: 'average', label: 'Average' },
    ];
    if (this.secondaryCurrency && this.secondaryRate) {
      columns.push({ key: 'secondary_valuation', label: `≈ ${this.secondaryCurrency} Valuation` });
    }
    return R.compose(this.tableColumnsCellIndexing)(columns);
  }
}
