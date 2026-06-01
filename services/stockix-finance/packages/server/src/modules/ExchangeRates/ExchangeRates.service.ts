import { Inject, Injectable } from '@nestjs/common';
import moment from 'moment';
import { ExchangeRate } from './lib/ExchangeRate';
import { ExchangeRateServiceType } from './lib/types';
import { TenantMetadata } from '@/modules/System/models/TenantMetadataModel';
import { ExchangeRateLatestDTO, EchangeRateLatestPOJO } from './ExchangeRates.types';
import { ExchangeRateModel } from './models/ExchangeRate.model';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { ModelObject } from 'objection';

@Injectable()
export class ExchangeRatesService {
  constructor(
    @Inject(ExchangeRateModel.name)
    private readonly exchangeRateModel: TenantModelProxy<typeof ExchangeRateModel>,
  ) {}
  /**
   * Gets the latest exchange rate.
   * @param {number} tenantId
   * @param {ExchangeRateLatestDTO} exchangeRateLatestDTO
   * @returns {EchangeRateLatestPOJO}
   */
  public async latest(
    tenantId: number,
    exchangeRateLatestDTO: ExchangeRateLatestDTO,
  ): Promise<EchangeRateLatestPOJO> {
    const organization = await TenantMetadata.query().findOne({ tenantId });

    // Assign the organization base currency as a default currency
    // if no currency is provided
    const fromCurrency =
      exchangeRateLatestDTO.fromCurrency || organization.baseCurrency;
    const toCurrency =
      exchangeRateLatestDTO.toCurrency || organization.baseCurrency;

    const exchange = new ExchangeRate(ExchangeRateServiceType.OpenExchangeRate);
    const exchangeRate = await exchange.latest(fromCurrency, toCurrency);

    return {
      baseCurrency: fromCurrency,
      toCurrency: exchangeRateLatestDTO.toCurrency || toCurrency,
      exchangeRate,
    };
  }

  /**
   * Looks up the latest stored exchange rate on or before the given date.
   */
  public async lookupRateByDate(
    currencyCode: string,
    date: string | Date,
  ): Promise<ModelObject<ExchangeRateModel> | null> {
    const rate = await this.exchangeRateModel()
      .query()
      .where('currencyCode', currencyCode)
      .where('date', '<=', moment(date).format('YYYY-MM-DD'))
      .orderBy('date', 'DESC')
      .first();

    return rate ?? null;
  }
}
