import { Module } from '@nestjs/common';
import { APAgingSummaryService } from './APAgingSummaryService';
import { AgingSummaryModule } from '../AgingSummary/AgingSummary.module';
import { APAgingSummaryTableInjectable } from './APAgingSummaryTableInjectable';
import { APAgingSummaryExportInjectable } from './APAgingSummaryExportInjectable';
import { APAgingSummaryPdfInjectable } from './APAgingSummaryPdfInjectable';
import { APAgingSummaryRepository } from './APAgingSummaryRepository';
import { APAgingSummaryApplication } from './APAgingSummaryApplication';
import { APAgingSummaryController } from './APAgingSummary.controller';
import { APAgingSummaryMeta } from './APAgingSummaryMeta';
import { FinancialSheetCommonModule } from '../../common/FinancialSheetCommon.module';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { ExchangeRatesModule } from '@/modules/ExchangeRates/ExchangeRates.module';

@Module({
  imports: [AgingSummaryModule, FinancialSheetCommonModule, ExchangeRatesModule],
  providers: [
    APAgingSummaryService,
    APAgingSummaryMeta,
    APAgingSummaryTableInjectable,
    APAgingSummaryExportInjectable,
    APAgingSummaryPdfInjectable,
    APAgingSummaryRepository,
    APAgingSummaryApplication,
    TenancyContext,
  ],
  controllers: [APAgingSummaryController],
})
export class APAgingSummaryModule {}
