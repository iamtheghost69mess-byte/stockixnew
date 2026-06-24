// RATE CONVENTION: Exchange rates in the exchange_rates table use Indirect Quote.
// "1 base = X foreign" (e.g. 1 USD = 0.925 EUR stored as 0.925 for EUR).
// To convert a base-currency amount to a display currency: secondaryAmount = baseAmount * rate.
// This is the OPPOSITE of the transaction-level exchangeRate field (Direct Quote: 1 foreign = X base).
// Never use exchange_rates table values in transaction GL computations.
import { ExchangeRatesService } from '@/modules/ExchangeRates/ExchangeRates.service';
import { TenantMetadata } from '@/modules/System/models/TenantMetadataModel';

export type SecondaryCurrencyContext = {
  secondaryCurrency: string;
  secondaryRate: number;
};

export type DisplayCurrencyContext = {
  currency: string;
  rate: number;
};

export async function resolveSecondaryCurrency(
  tenantMetadata: TenantMetadata | undefined,
  exchangeRatesService: ExchangeRatesService,
  asOfDate: string | Date,
): Promise<SecondaryCurrencyContext> {
  const secondaryCurrency = tenantMetadata?.secondaryCurrency ?? '';
  if (!secondaryCurrency) {
    return { secondaryCurrency: '', secondaryRate: 0 };
  }

  const rateRow = await exchangeRatesService.lookupRateByDate(
    secondaryCurrency,
    asOfDate,
  );

  if (!rateRow) {
    // Exchange rates are entered manually. If no rate exists for this date,
    // secondary-currency columns will show zero — operators should add the rate first.
    console.warn(
      `[resolveSecondaryCurrency] No exchange rate found for ${secondaryCurrency} on or before ${asOfDate}. ` +
      'Secondary-currency report columns will show 0. Add the rate via POST /exchange-rates.',
    );
  }

  return {
    secondaryCurrency,
    secondaryRate: Number(rateRow?.exchangeRate ?? 0),
  };
}

/**
 * Resolves all display currencies configured for the org (display_currencies + secondary_currency).
 * Returns one {currency, rate} entry per configured display currency.
 * All rates are Indirect Quote: 1 base = X foreign.
 * Used to generate N secondary columns in financial reports.
 */
export async function resolveDisplayCurrencies(
  tenantMetadata: TenantMetadata | undefined,
  exchangeRatesService: ExchangeRatesService,
  asOfDate: string | Date,
): Promise<DisplayCurrencyContext[]> {
  const displayCurrencies: string[] = tenantMetadata?.displayCurrencies ?? [];
  const secondary = tenantMetadata?.secondaryCurrency ?? '';

  // Merge display_currencies + secondary_currency, deduplicate
  const allCurrencies = [...new Set([...displayCurrencies, ...(secondary ? [secondary] : [])])].filter(Boolean);

  if (!allCurrencies.length) return [];

  const results: DisplayCurrencyContext[] = [];
  for (const currency of allCurrencies) {
    const rateRow = await exchangeRatesService.lookupRateByDate(currency, asOfDate);
    if (!rateRow) {
      console.warn(
        `[resolveDisplayCurrencies] No rate for ${currency} on or before ${asOfDate}. ` +
        'Column will show 0. Add the rate via POST /exchange-rates.',
      );
    }
    results.push({ currency, rate: Number(rateRow?.exchangeRate ?? 0) });
  }
  return results;
}
