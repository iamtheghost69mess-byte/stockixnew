import { Module } from '@nestjs/common';
import { PdfDisplayTotalsService } from './PdfDisplayTotals.service';
import { ExchangeRatesModule } from '../ExchangeRates/ExchangeRates.module';
import { TenancyModule } from '../Tenancy/Tenancy.module';

@Module({
  imports: [ExchangeRatesModule, TenancyModule],
  providers: [PdfDisplayTotalsService],
  exports: [PdfDisplayTotalsService],
})
export class PdfModule {}
