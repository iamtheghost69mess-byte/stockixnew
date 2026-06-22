import { ExchangeRatesService } from '@/modules/ExchangeRates/ExchangeRates.service';
import { TenantMetadata } from '@/modules/System/models/TenantMetadataModel';

export type SecondaryCurrencyContext = {
  secondaryCurrency: string;
  secondaryRate: number;
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
