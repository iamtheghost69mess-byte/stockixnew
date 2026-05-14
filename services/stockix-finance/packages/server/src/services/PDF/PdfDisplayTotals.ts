import ExchangeRatesService from '@/services/ExchangeRates/ExchangeRatesService';
import { formatNumber } from 'utils';

export interface PdfDisplayTotal {
  currency: string;
  formattedTotal: string;
  formattedDueAmount: string;
}

/**
 * Builds secondary currency rows for PDF totals sections.
 * Returns one entry per additional currency that differs from the document's
 * own currency.
 *
 * Currencies considered (de-duplicated, in this order):
 *   1. base currency (when the doc is in a foreign currency)
 *   2. the tenant's optional `secondaryCurrency` (when set)
 *   3. any `displayCurrencies` configured on the org
 *
 * @param exchangeRatesService - injected ExchangeRatesService
 * @param tenantId
 * @param docCurrency - the document's own currency code
 * @param docDate - the document date (used for rate lookup)
 * @param totalInBase - total amount already in base currency
 * @param dueInBase - due/remaining amount already in base currency (pass same as totalInBase if N/A)
 * @param baseCurrency - org base currency
 * @param displayCurrencies - additional currencies configured on the org
 * @param secondaryCurrency - optional single secondary currency
 */
export async function buildPdfDisplayTotals(
  exchangeRatesService: ExchangeRatesService,
  tenantId: number,
  docCurrency: string,
  docDate: string | Date,
  totalInBase: number,
  dueInBase: number,
  baseCurrency: string,
  displayCurrencies: string[],
  secondaryCurrency?: string | null,
): Promise<PdfDisplayTotal[]> {
  const results: PdfDisplayTotal[] = [];

  if (docCurrency !== baseCurrency) {
    results.push({
      currency: baseCurrency,
      formattedTotal: formatNumber(totalInBase, { currencyCode: baseCurrency }),
      formattedDueAmount: formatNumber(dueInBase, { currencyCode: baseCurrency }),
    });
  }

  // Build the unique list of currencies still to render. Secondary first, then
  // the configured display currencies. Skip any duplicates already covered.
  const seen = new Set<string>([docCurrency, baseCurrency]);
  const extra: string[] = [];
  if (secondaryCurrency) extra.push(secondaryCurrency);
  for (const c of displayCurrencies ?? []) extra.push(c);

  for (const dc of extra) {
    if (!dc || seen.has(dc)) continue;
    seen.add(dc);
    try {
      const rateRow = await exchangeRatesService.lookupRateByDate(tenantId, dc, docDate);
      if (!rateRow) continue;
      const converted = totalInBase / rateRow.exchangeRate;
      const convertedDue = dueInBase / rateRow.exchangeRate;
      results.push({
        currency: dc,
        formattedTotal: formatNumber(converted, { currencyCode: dc }),
        formattedDueAmount: formatNumber(convertedDue, { currencyCode: dc }),
      });
    } catch {
      // no rate — skip
    }
  }

  return results;
}
