import { Module } from '@nestjs/common';
import { ProfitLossSheetService } from './ProfitLossSheetService';
import { ProfitLossSheetExportInjectable } from './ProfitLossSheetExportInjectable';
import { ProfitLossTablePdfInjectable } from './ProfitLossTablePdfInjectable';
import { ProfitLossSheetTableInjectable } from './ProfitLossSheetTableInjectable';
import { ProfitLossSheetMeta } from './ProfitLossSheetMeta';
import { ProfitLossSheetRepository } from './ProfitLossSheetRepository';
import { AccountsModule } from '@/modules/Accounts/Accounts.module';
import { FinancialSheetCommonModule } from '../../common/FinancialSheetCommon.module';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { ProfitLossSheetController } from './ProfitLossSheet.controller';
import { ProfitLossSheetApplication } from './ProfitLossSheetApplication';
import { ExchangeRatesModule } from '@/modules/ExchangeRates/ExchangeRates.module';

@Module({
  imports: [FinancialSheetCommonModule, AccountsModule, ExchangeRatesModule],
  controllers: [ProfitLossSheetController],
  providers: [
    ProfitLossSheetApplication,
    ProfitLossSheetService,
    ProfitLossSheetExportInjectable,
    ProfitLossTablePdfInjectable,
    ProfitLossSheetTableInjectable,
    ProfitLossSheetMeta,
    ProfitLossSheetRepository,
    TenancyContext,
  ],
})
export class ProfitLossSheetModule {}
