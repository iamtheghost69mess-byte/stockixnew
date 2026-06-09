import { ARAgingSummaryService } from './ARAgingSummaryService';
import { Injectable } from '@nestjs/common';
import { IARAgingSummaryTable } from './ARAgingSummary.types';
import { ARAgingSummaryQueryDto } from './ARAgingSummaryQuery.dto';
import { buildAgingSummaryTable } from '../AgingSummary/build-aging-summary-table';

@Injectable()
export class ARAgingSummaryTableInjectable {
  constructor(private readonly ARAgingSummarySheet: ARAgingSummaryService) {}

  /**
   * Retrieves A/R aging summary in table format.
   * @param {ARAgingSummaryQueryDto} query - Aging summary query.
   * @returns {Promise<IARAgingSummaryTable>}
   */
  public async table(
    query: ARAgingSummaryQueryDto,
  ): Promise<IARAgingSummaryTable> {
    const report = await this.ARAgingSummarySheet.ARAgingSummary(query);
    const table = buildAgingSummaryTable(report.data, report.columns, {
      contactNameLabel: 'Customer name',
      contactNameKey: 'customer_name',
      contactNameAccessor: 'customerName',
    });

    return {
      table,
      meta: report.meta,
      query,
    };
  }
}
