import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClsService } from 'nestjs-cls';
import moment from 'moment';
import { ExchangeRatesService } from '../ExchangeRates.service';
import { Currency } from '@/modules/Currencies/models/Currency.model';
import { TenantModel } from '@/modules/System/models/TenantModel';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { ExchangeRateModel } from '../models/ExchangeRate.model';

@Injectable()
export class FetchLiveRatesJob {
  private readonly logger = new Logger(FetchLiveRatesJob.name);

  constructor(
    private readonly cls: ClsService,
    private readonly exchangeRatesService: ExchangeRatesService,
    @Inject(TenantModel.name)
    private readonly systemTenantModel: typeof TenantModel,
    @Inject(Currency.name)
    private readonly currencyModel: TenantModelProxy<typeof Currency>,
    @Inject(ExchangeRateModel.name)
    private readonly exchangeRateModel: TenantModelProxy<typeof ExchangeRateModel>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    this.logger.log('Starting daily exchange rates sync...');
    
    try {
      const tenants = await this.systemTenantModel
        .query()
        .withGraphFetched('metadata')
        .whereNotNull('seededAt');

      for (const tenant of tenants) {
        if (!tenant.metadata?.baseCurrency) {
          continue;
        }

        await this.cls.run(async () => {
          this.cls.set('tenantId', tenant.id);
          this.cls.set('organizationId', tenant.organizationId);

          try {
            const currencies = await this.currencyModel().query();
            const baseCurrency = tenant.metadata.baseCurrency;
            const date = moment().format('YYYY-MM-DD');

            for (const currency of currencies) {
              if (currency.currencyCode === baseCurrency) {
                continue;
              }

              const latestRate = await this.exchangeRatesService.latest(tenant.id, {
                fromCurrency: baseCurrency,
                toCurrency: currency.currencyCode,
              });

              if (latestRate && latestRate.exchangeRate) {
                const existingRate = await this.exchangeRateModel()
                  .query()
                  .findOne({
                    currencyCode: currency.currencyCode,
                    date: date,
                  });

                if (existingRate) {
                  await this.exchangeRateModel()
                    .query()
                    .findById(existingRate.id)
                    .patch({ exchangeRate: latestRate.exchangeRate });
                } else {
                  await this.exchangeRateModel().query().insert({
                    currencyCode: currency.currencyCode,
                    exchangeRate: latestRate.exchangeRate,
                    date: date,
                  });
                }
              }
            }
          } catch (tenantError) {
            this.logger.error(
              `Failed to sync exchange rates for tenant ${tenant.id}`,
              tenantError,
            );
          }
        });
      }
    } catch (error) {
      this.logger.error('Failed to execute exchange rates sync job', error);
    }
    
    this.logger.log('Finished daily exchange rates sync.');
  }
}
