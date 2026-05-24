import { Module } from '@nestjs/common';
import { RegisterTenancyModel } from '../Tenancy/TenancyModels/Tenancy.module';
import { Currency } from './models/Currency.model';
import { CreateCurrencyService } from './commands/CreateCurrency.service';
import { EditCurrencyService } from './commands/EditCurrency.service';
import { DeleteCurrencyService } from './commands/DeleteCurrency.service';
import { SeedInitialCurrenciesOnSetupSubsriber } from './subscribers/SeedInitialCurrenciesOnSetup.subscriber';
import { InitialCurrenciesSeedService } from './commands/InitialCurrenciesSeed.service';
import { CurrenciesApplication } from './CurrenciesApplication.service';
import { CurrenciesController } from './Currencies.controller';
import { TenancyModule } from '../Tenancy/Tenancy.module';
import { GetCurrenciesService } from './queries/GetCurrencies.service';
import { GetCurrencyService } from './queries/GetCurrency.service';
import { ExchangeRatesModule } from '../ExchangeRates/ExchangeRates.module';
import { ExchangeRateValidator } from './ExchangeRateValidator';

const models = [RegisterTenancyModel(Currency)];

@Module({
  imports: [...models, TenancyModule, ExchangeRatesModule],
  exports: [...models, ExchangeRateValidator],
  providers: [
    ExchangeRateValidator,
    CreateCurrencyService,
    EditCurrencyService,
    DeleteCurrencyService,
    GetCurrenciesService,
    GetCurrencyService,
    CurrenciesApplication,
    InitialCurrenciesSeedService,
    SeedInitialCurrenciesOnSetupSubsriber
  ],
  controllers: [CurrenciesController]
})
export class CurrenciesModule {}
