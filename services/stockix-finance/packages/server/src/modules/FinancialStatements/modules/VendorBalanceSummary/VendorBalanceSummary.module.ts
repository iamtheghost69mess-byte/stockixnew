import { Module } from '@nestjs/common';
import { VendorBalanceSummaryController } from './VendorBalanceSummary.controller';
import { VendorBalanceSummaryService } from './VendorBalanceSummaryService';
import { VendorBalanceSummaryTableInjectable } from './VendorBalanceSummaryTableInjectable';
import { VendorBalanceSummaryExportInjectable } from './VendorBalanceSummaryExportInjectable';
import { VendorBalanceSummaryPdf } from './VendorBalanceSummaryPdf';
import { VendorBalanceSummaryApplication } from './VendorBalanceSummaryApplication';
import { VendorBalanceSummaryRepository } from './VendorBalanceSummaryRepository';
import { VendorBalanceSummaryMeta } from './VendorBalanceSummaryMeta';
import { FinancialSheetCommonModule } from '../../common/FinancialSheetCommon.module';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { ExchangeRatesModule } from '@/modules/ExchangeRates/ExchangeRates.module';

@Module({
  imports: [FinancialSheetCommonModule, ExchangeRatesModule],
  providers: [
    VendorBalanceSummaryTableInjectable,
    VendorBalanceSummaryExportInjectable,
    VendorBalanceSummaryService,
    VendorBalanceSummaryPdf,
    VendorBalanceSummaryApplication,
    VendorBalanceSummaryRepository,
    VendorBalanceSummaryMeta,
    TenancyContext,
  ],
  controllers: [VendorBalanceSummaryController],
})
export class VendorBalanceSummaryModule {}
