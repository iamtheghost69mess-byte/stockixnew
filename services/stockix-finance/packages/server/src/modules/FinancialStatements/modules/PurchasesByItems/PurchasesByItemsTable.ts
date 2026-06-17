import * as R from 'ramda';
import { ROW_TYPE } from './_types';
import {
  IPurchasesByItemsItem,
  IPurchasesByItemsSheetData,
  IPurchasesByItemsTotal,
} from './types/PurchasesByItems.types';
import { ITableColumn, ITableColumnAccessor, ITableRow } from '../../types/Table.types';
import { FinancialTable } from '../../common/FinancialTable';
import { FinancialSheetStructure } from '../../common/FinancialSheetStructure';
import { FinancialSheet } from '../../common/FinancialSheet';
import { tableRowMapper } from '../../utils/Table.utils';

export class PurchasesByItemsTable extends R.compose(
  FinancialTable,
  FinancialSheetStructure
)(FinancialSheet) {
  private data: IPurchasesByItemsSheetData;
  private readonly secondaryCurrency: string;
  private readonly secondaryRate: number;

  constructor(data: IPurchasesByItemsSheetData, secondaryCurrency?: string, secondaryRate?: number) {
    super();
    this.data = data;
    this.secondaryCurrency = secondaryCurrency ?? '';
    this.secondaryRate = secondaryRate ?? 0;
  }

  private commonTableAccessors(): ITableColumnAccessor[] {
    const accessors: any[] = [
      { key: 'item_name', accessor: 'name' },
      { key: 'quantity_purchases', accessor: 'quantityPurchasedFormatted' },
      { key: 'purchase_amount', accessor: 'purchaseCostFormatted' },
      { key: 'average_cost', accessor: 'averageCostPriceFormatted' },
    ];
    if (this.secondaryCurrency && this.secondaryRate) {
      accessors.push({ key: 'secondary_purchase_amount', accessor: 'secondary.formattedAmount' });
    }
    return accessors;
  }

  private decorateSecondary = (node: IPurchasesByItemsItem | IPurchasesByItemsTotal): any => {
    if (!this.secondaryCurrency || !this.secondaryRate) return node;
    return {
      ...node,
      secondary: {
        formattedAmount: this.formatTotalNumber(node.purchaseCost * this.secondaryRate, {
          currencyCode: this.secondaryCurrency,
        }),
      },
    };
  };

  private itemMap = (item: IPurchasesByItemsItem): ITableRow => {
    return tableRowMapper(this.decorateSecondary(item), this.commonTableAccessors(), {
      rowTypes: [ROW_TYPE.ITEM],
    });
  };

  private itemsMap = (items: IPurchasesByItemsItem[]): ITableRow[] => {
    return R.map(this.itemMap)(items);
  };

  private totalNodeMap = (total: IPurchasesByItemsTotal): ITableRow => {
    return tableRowMapper(this.decorateSecondary(total), this.commonTableAccessors(), {
      rowTypes: [ROW_TYPE.TOTAL],
    });
  };

  public tableColumns(): ITableColumn[] {
    const columns: any[] = [
      { label: 'Item name', key: 'item_name' },
      { label: 'Quantity Purchased', key: 'quantity_purchases' },
      { label: 'Purchase Amount', key: 'purchase_amount' },
      { label: 'Average Price', key: 'average_cost' },
    ];
    if (this.secondaryCurrency && this.secondaryRate) {
      columns.push({ key: 'secondary_purchase_amount', label: `≈ ${this.secondaryCurrency} Purchase Amount` });
    }
    return R.compose(this.tableColumnsCellIndexing)(columns);
  }

  public tableData(): ITableRow[] {
    const itemsRows = this.itemsMap(this.data.items);
    const totalRow = this.totalNodeMap(this.data.total);

    return R.compose(
      R.when(R.always(R.not(R.isEmpty(itemsRows))), R.append(totalRow))
    )(itemsRows) as ITableRow[];
  }
}
