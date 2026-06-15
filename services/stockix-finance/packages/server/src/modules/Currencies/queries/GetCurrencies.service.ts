import { Inject, Injectable } from '@nestjs/common';
import { Currency } from '../models/Currency.model';
import { TenantModelProxy } from '../../System/models/TenantBaseModel';
import { TransformerInjectable } from '../../Transformer/TransformerInjectable.service';
import { CurrencyTransformer } from '../Currency.transformer';
import { ExchangeRateModel } from '@/modules/ExchangeRates/models/ExchangeRate.model';

@Injectable()
export class GetCurrenciesService {
  constructor(
    @Inject(Currency.name)
    private readonly currencyModel: TenantModelProxy<typeof Currency>,
    @Inject(ExchangeRateModel.name)
    private readonly exchangeRateModel: TenantModelProxy<typeof ExchangeRateModel>,
    private readonly transformerInjectable: TransformerInjectable,
  ) {}

  /**
   * Retrieves currencies list.
   */
  public async getCurrencies(): Promise<Currency[]> {
    const [currencies, allRates] = await Promise.all([
      this.currencyModel().query().onBuild((query) => {
        query.orderBy('createdAt', 'ASC');
      }),
      this.exchangeRateModel()
        .query()
        .select('id', 'currencyCode', 'exchangeRate', 'date')
        .orderBy('date', 'DESC'),
    ]);

    const latestRatesMap: Record<
      string,
      { id: number; exchangeRate: number; date: string }
    > = {};

    for (const rate of allRates) {
      if (!(rate.currencyCode in latestRatesMap)) {
        latestRatesMap[rate.currencyCode] = rate;
      }
    }

    return this.transformerInjectable.transform(
      currencies,
      new CurrencyTransformer(),
      { latestRatesMap },
    );
  }
}