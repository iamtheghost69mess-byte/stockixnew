import * as R from 'ramda';
import {
  SalesTaxLiabilitySummaryQuery,
  SalesTaxLiabilitySummaryRate,
  SalesTaxLiabilitySummaryReportData,
  SalesTaxLiabilitySummaryTotal,
} from './SalesTaxLiability.types';
import { AgingReport } from '../AgingSummary/AgingReport';
import { IROW_TYPE } from './_constants';
import { FinancialTable } from '../../common/FinancialTable';
import { FinancialSheetStructure } from '../../common/FinancialSheetStructure';
import { ITableRow } from '../../types/Table.types';
import { ITableColumn } from '../../types/Table.types';
import { tableRowMapper } from '../../utils/Table.utils';

export class SalesTaxLiabilitySummaryTable extends R.pipe(
  FinancialTable,
  FinancialSheetStructure,
)(AgingReport) {
  private data: SalesTaxLiabilitySummaryReportData;
  private query: SalesTaxLiabilitySummaryQuery;
  private readonly secondaryCurrency: string;
  private readonly secondaryRate: number;

  constructor(
    data: SalesTaxLiabilitySummaryReportData,
    query: SalesTaxLiabilitySummaryQuery,
    secondaryCurrency?: string,
    secondaryRate?: number,
  ) {
    super();

    this.data = data;
    this.query = query;
    this.secondaryCurrency = secondaryCurrency ?? '';
    this.secondaryRate = secondaryRate ?? 0;
  }

  private get taxRateRowAccessor() {
    const accessors: any[] = [
      { key: 'taxName', accessor: 'taxName' },
      { key: 'taxPercentage', accessor: 'taxPercentage.formattedAmount' },
      { key: 'taxableAmount', accessor: 'taxableAmount.formattedAmount' },
      { key: 'collectedTax', accessor: 'collectedTaxAmount.formattedAmount' },
      { key: 'taxAmount', accessor: 'taxAmount.formattedAmount' },
    ];
    if (this.secondaryCurrency && this.secondaryRate) {
      accessors.push({ key: 'secondary_tax_amount', accessor: 'secondary.formattedAmount' });
    }
    return accessors;
  }

  private get taxRateTotalRowAccessors() {
    const accessors: any[] = [
      { key: 'taxName', value: 'Total' },
      { key: 'taxPercentage', value: '' },
      { key: 'taxableAmount', accessor: 'taxableAmount.formattedAmount' },
      { key: 'collectedTax', accessor: 'collectedTaxAmount.formattedAmount' },
      { key: 'taxAmount', accessor: 'taxAmount.formattedAmount' },
    ];
    if (this.secondaryCurrency && this.secondaryRate) {
      accessors.push({ key: 'secondary_tax_amount', accessor: 'secondary.formattedAmount' });
    }
    return accessors;
  }

  private decorateSecondary = (node: any): any => {
    if (!this.secondaryCurrency || !this.secondaryRate) return node;
    return {
      ...node,
      secondary: {
        formattedAmount: this.formatTotalNumber(node.taxAmount.amount * this.secondaryRate, {
          currencyCode: this.secondaryCurrency,
        }),
      },
    };
  };

  private taxRateTableRowMapper = (
    node: SalesTaxLiabilitySummaryRate,
  ): ITableRow => {
    return tableRowMapper(this.decorateSecondary(node), this.taxRateRowAccessor, {
      rowTypes: [IROW_TYPE.TaxRate],
      id: node.id,
    });
  };

  private taxRatesTableRowsMapper = (
    nodes: SalesTaxLiabilitySummaryRate[],
  ): ITableRow[] => {
    return nodes.map(this.taxRateTableRowMapper);
  };

  private taxRateTotalRowMapper = (node: SalesTaxLiabilitySummaryTotal) => {
    return tableRowMapper(this.decorateSecondary(node), this.taxRateTotalRowAccessors, {
      rowTypes: [IROW_TYPE.Total],
    });
  };

  private get taxRateTotalRow(): ITableRow {
    return this.taxRateTotalRowMapper(this.data.total);
  }

  private get taxRatesRows(): ITableRow[] {
    return this.taxRatesTableRowsMapper(this.data.taxRates);
  }

  public tableRows(): ITableRow[] {
    return R.compose(
      R.unless(R.isEmpty, R.append(this.taxRateTotalRow)),
      R.concat(this.taxRatesRows),
    )([]);
  }

  public tableColumns(): ITableColumn[] {
    const columns: any[] = [
      { label: 'Tax Name', key: 'taxName' },
      { label: 'Tax Percentage', key: 'taxPercentage' },
      { label: 'Taxable Amount', key: 'taxableAmount' },
      { label: 'Collected Tax', key: 'collectedTax' },
      { label: 'Tax Amount', key: 'taxRate' },
    ];
    if (this.secondaryCurrency && this.secondaryRate) {
      columns.push({ key: 'secondary_tax_amount', label: `≈ ${this.secondaryCurrency} Tax Amount` });
    }
    return R.compose(this.tableColumnsCellIndexing)(columns);
  }
}
