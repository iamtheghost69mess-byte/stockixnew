import { Injectable } from '@nestjs/common';
import { IAPAgingSummaryTable } from './APAgingSummary.types';
import { APAgingSummaryService } from './APAgingSummaryService';
import { APAgingSummaryQueryDto } from './APAgingSummaryQuery.dto';
import { buildAgingSummaryTable } from '../AgingSummary/build-aging-summary-table';

@Injectable()
export class APAgingSummaryTableInjectable {
  constructor(private readonly APAgingSummarySheet: APAgingSummaryService) {}

  /**
   * Retrieves A/P aging summary in table format.
   * @param {APAgingSummaryQueryDto} query -
   * @returns {Promise<IAPAgingSummaryTable>}
   */
  public async table(
    query: APAgingSummaryQueryDto,
  ): Promise<IAPAgingSummaryTable> {
    const report = await this.APAgingSummarySheet.APAgingSummary(query);
    const table = buildAgingSummaryTable(report.data, report.columns, {
      contactNameLabel: 'Vendor name',
      contactNameKey: 'vendor_name',
      contactNameAccessor: 'vendorName',
    });

    return {
      table,
      meta: report.meta,
      query: report.query,
    };
  }
}
