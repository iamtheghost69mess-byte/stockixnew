import * as R from 'ramda';
import {
  ISalesByItemsItem,
  ISalesByItemsSheetData,
  ISalesByItemsTotal,
} from './SalesByItems.types';
import { ROW_TYPE } from './constants';
import { FinancialTable } from '../../common/FinancialTable';
import { FinancialSheetStructure } from '../../common/FinancialSheetStructure';
import { FinancialSheet } from '../../common/FinancialSheet';
import { ITableColumn, ITableRow } from '../../types/Table.types';
import { tableRowMapper } from '../../utils/Table.utils';

export class SalesByItemsTable extends R.pipe(
  FinancialTable,
  FinancialSheetStructure,
)(FinancialSheet) {
  private readonly data: ISalesByItemsSheetData;
  private readonly secondaryCurrency: string;
  private readonly secondaryRate: number;

  constructor(data: ISalesByItemsSheetData, secondaryCurrency?: string, secondaryRate?: number) {
    super();
    this.data = data;
    this.secondaryCurrency = secondaryCurrency ?? '';
    this.secondaryRate = secondaryRate ?? 0;
  }

  private commonTableAccessors() {
    const accessors: any[] = [
      { key: 'item_name', accessor: 'name' },
      { key: 'sold_quantity', accessor: 'quantitySoldFormatted' },
      { key: 'sold_amount', accessor: 'soldCostFormatted' },
      { key: 'average_price', accessor: 'averageSellPriceFormatted' },
    ];
    if (this.secondaryCurrency && this.secondaryRate) {
      accessors.push({ key: 'secondary_sold_amount', accessor: 'secondary.formattedAmount' });
    }
    return accessors;
  }

  private decorateSecondary = (node: ISalesByItemsItem | ISalesByItemsTotal): any => {
    if (!this.secondaryCurrency || !this.secondaryRate) return node;
    return {
      ...node,
      secondary: {
        formattedAmount: this.formatTotalNumber(node.soldCost * this.secondaryRate, {
          currencyCode: this.secondaryCurrency,
        }),
      },
    };
  };

  private itemMap = (item: ISalesByItemsItem): ITableRow => {
    return tableRowMapper(this.decorateSecondary(item), this.commonTableAccessors(), {
      rowTypes: [ROW_TYPE.ITEM],
    });
  };

  private itemsMap = (items: ISalesByItemsItem[]): ITableRow[] => {
    return R.map(this.itemMap, items);
  };

  private totalMap = (total: ISalesByItemsTotal) => {
    return tableRowMapper(this.decorateSecondary(total), this.commonTableAccessors(), {
      rowTypes: [ROW_TYPE.TOTAL],
    });
  };

  public tableData(): ITableRow[] {
    const itemsRows = this.itemsMap(this.data.items);
    const totalRow = this.totalMap(this.data.total);

    return R.compose(
      R.when(R.always(R.not(R.isEmpty(itemsRows))), R.append(totalRow))
    )([...itemsRows]) as ITableRow[];
  }

  public tableColumns(): ITableColumn[] {
    const columns: any[] = [
      { key: 'item_name', label: 'Item name' },
      { key: 'sold_quantity', label: 'Sold quantity' },
      { key: 'sold_amount', label: 'Sold amount' },
      { key: 'average_price', label: 'Average price' },
    ];
    if (this.secondaryCurrency && this.secondaryRate) {
      columns.push({ key: 'secondary_sold_amount', label: `≈ ${this.secondaryCurrency} Sold Amount` });
    }
    return R.compose(this.tableColumnsCellIndexing)(columns);
  }
}
