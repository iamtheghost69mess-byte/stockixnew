import { InventoryValuationSheetService } from './InventoryValuationSheetService';
import {
  IInventoryValuationReportQuery,
  IInventoryValuationTable,
} from './InventoryValuationSheet.types';
import { InventoryValuationSheetTable } from './InventoryValuationSheetTable';
import { Injectable } from '@nestjs/common';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { ExchangeRatesService } from '@/modules/ExchangeRates/ExchangeRates.service';
import { resolveSecondaryCurrency } from '../../common/resolveSecondaryCurrency';

@Injectable()
export class InventoryValuationSheetTableInjectable {
  constructor(
    private readonly sheet: InventoryValuationSheetService,
    private readonly tenancyContext: TenancyContext,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  public async table(
    filter: IInventoryValuationReportQuery,
  ): Promise<IInventoryValuationTable> {
    const { data, query, meta } = await this.sheet.inventoryValuationSheet(filter);

    const tenantMetadata = await this.tenancyContext.getTenantMetadata();
    const { secondaryCurrency, secondaryRate } = await resolveSecondaryCurrency(
      tenantMetadata,
      this.exchangeRatesService,
      filter.asDate ?? new Date(),
    );

    const table = new InventoryValuationSheetTable(data, secondaryCurrency, secondaryRate);

    return {
      table: {
        columns: table.tableColumns(),
        rows: table.tableRows(),
      },
      query,
      meta,
    };
  }
}
