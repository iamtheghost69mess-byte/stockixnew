import { Injectable } from '@nestjs/common';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { ExchangeRatesService } from '@/modules/ExchangeRates/ExchangeRates.service';
import {
  buildPdfDisplayTotals,
  PdfDisplayTotal,
} from './utils/PdfDisplayTotals';

export interface BuildPdfDisplayTotalsParams {
  docCurrency: string;
  docDate: string | Date;
  totalInBase: number;
  dueInBase: number;
}

@Injectable()
export class PdfDisplayTotalsService {
  constructor(
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly tenancyContext: TenancyContext,
  ) {}

  public async buildForDocument(
    params: BuildPdfDisplayTotalsParams,
  ): Promise<PdfDisplayTotal[]> {
    const tenant = await this.tenancyContext.getTenant(true);
    const metadata = tenant.metadata;

    if (!metadata) {
      return [];
    }

    const baseCurrency = metadata.baseCurrency;
    const displayCurrencies = metadata.displayCurrencies ?? [];
    const secondaryCurrency = metadata.secondaryCurrency ?? null;

    return buildPdfDisplayTotals(
      this.exchangeRatesService,
      params.docCurrency,
      params.docDate,
      params.totalInBase,
      params.dueInBase,
      baseCurrency,
      displayCurrencies,
      secondaryCurrency,
    );
  }
}
