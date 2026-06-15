import { Module } from '@nestjs/common';
import { ExchangeRatesController } from './ExchangeRates.controller';
import { ExchangeRatesService } from './ExchangeRates.service';
import { ExchangeRateApplication } from './ExchangeRates.application';
import { RegisterTenancyModel } from '../Tenancy/TenancyModels/Tenancy.module';
import { ExchangeRateModel } from './models/ExchangeRate.model';
import { TenancyModule } from '../Tenancy/Tenancy.module';

const models = [RegisterTenancyModel(ExchangeRateModel)];

@Module({
  imports: [...models, TenancyModule],
  providers: [ExchangeRatesService, ExchangeRateApplication],
  controllers: [ExchangeRatesController],
  exports: [...models, ExchangeRatesService, ExchangeRateApplication],
})
export class ExchangeRatesModule {}
