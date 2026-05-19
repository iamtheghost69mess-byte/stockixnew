import { formatNumber } from '@/utils/format-number';
import { ExchangeRatesService } from '@/modules/ExchangeRates/ExchangeRates.service';

export interface PdfDisplayTotal {
  currency: string;
  formattedTotal: string;
  formattedDueAmount: string;
}

/**
 * Builds secondary currency rows for PDF totals sections.
 */
export async function buildPdfDisplayTotals(
  exchangeRatesService: ExchangeRatesService,
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

  const seen = new Set<string>([docCurrency, baseCurrency]);
  const extra: string[] = [];
  if (secondaryCurrency) {
    extra.push(secondaryCurrency);
  }
  for (const c of displayCurrencies ?? []) {
    extra.push(c);
  }

  for (const dc of extra) {
    if (!dc || seen.has(dc)) {
      continue;
    }
    seen.add(dc);
    try {
      const rateRow = await exchangeRatesService.lookupRateByDate(dc, docDate);
      if (!rateRow) {
        continue;
      }
      const converted = totalInBase * rateRow.exchangeRate;
      const convertedDue = dueInBase * rateRow.exchangeRate;
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
