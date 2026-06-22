import { Module } from '@nestjs/common';
import { ExchangeRatesController } from './ExchangeRates.controller';
import { ExchangeRatesService } from './ExchangeRates.service';
import { ExchangeRateApplication } from './ExchangeRates.application';
import { RegisterTenancyModel } from '../Tenancy/TenancyModels/Tenancy.module';
import { ExchangeRateModel } from './models/ExchangeRate.model';
import { TenancyModule } from '../Tenancy/Tenancy.module';
import { FetchLiveRatesJob } from './jobs/FetchLiveRates.job';
import { Currency } from '../Currencies/models/Currency.model';

// Currency model registered here directly to avoid a circular import with CurrenciesModule.
const models = [
  RegisterTenancyModel(ExchangeRateModel),
  RegisterTenancyModel(Currency),
];

@Module({
  imports: [...models, TenancyModule],
  providers: [ExchangeRatesService, ExchangeRateApplication, FetchLiveRatesJob],
  controllers: [ExchangeRatesController],
  exports: [...models, ExchangeRatesService, ExchangeRateApplication],
})
export class ExchangeRatesModule {}
