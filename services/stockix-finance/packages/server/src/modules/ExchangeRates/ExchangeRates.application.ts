import { Injectable } from '@nestjs/common';
import { ExchangeRatesService } from './ExchangeRates.service';
import { ExchangeRateLatestDTO, EchangeRateLatestPOJO } from './ExchangeRates.types';

@Injectable()
export class ExchangeRateApplication {
  constructor(private readonly exchangeRateService: ExchangeRatesService) {}

  /**
   * Gets the latest exchange rate.
   * @param {number} tenantId
   * @param {ExchangeRateLatestDTO} exchangeRateLatestDTO
   * @returns {Promise<EchangeRateLatestPOJO>}
   */
  public latest(
    tenantId: number,
    exchangeRateLatestDTO: ExchangeRateLatestDTO,
  ): Promise<EchangeRateLatestPOJO> {
    return this.exchangeRateService.latest(tenantId, exchangeRateLatestDTO);
  }

  /**
   * Returns the stored exchange rate for a currency on or before a date.
   */
  public rateByDate(currencyCode: string, date: string) {
    return this.exchangeRateService.lookupRateByDate(currencyCode, date);
  }

  /**
   * Returns sync status for all currencies — used by the UI to surface stale-rate warnings.
   */
  public syncStatus() {
    return this.exchangeRateService.syncStatus();
  }
}
