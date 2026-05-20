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

  return {
    secondaryCurrency,
    secondaryRate: Number(rateRow?.exchangeRate ?? 0),
  };
}
