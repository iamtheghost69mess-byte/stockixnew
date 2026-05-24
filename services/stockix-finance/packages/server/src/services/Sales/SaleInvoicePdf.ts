import { Inject, Service } from 'typedi';
import PdfService from '@/services/PDF/PdfService';
import ExchangeRatesService from '@/services/ExchangeRates/ExchangeRatesService';
import { templateRender } from 'utils';
import HasTenancyService from '@/services/Tenancy/TenancyService';
import { Tenant } from '@/system/models';
import { buildPdfDisplayTotals } from '@/services/PDF/PdfDisplayTotals';

@Service()
export default class SaleInvoicePdf {
  @Inject()
  pdfService: PdfService;

  @Inject()
  tenancy: HasTenancyService;

  @Inject()
  exchangeRatesService: ExchangeRatesService;

  async saleInvoicePdf(tenantId: number, saleInvoice) {
    const i18n = this.tenancy.i18n(tenantId);

    const organization = await Tenant.query()
      .findById(tenantId)
      .withGraphFetched('metadata');

    const baseCurrency: string =
      organization.metadata?.baseCurrency ?? organization.metadata?.base_currency ?? '';
    const displayCurrencies: string[] =
      organization.metadata?.displayCurrencies ?? organization.metadata?.display_currencies ?? [];
    const secondaryCurrency: string | null =
      organization.metadata?.secondaryCurrency ?? organization.metadata?.secondary_currency ?? null;

    const totalInBase = saleInvoice.localAmount ?? saleInvoice.balance;
    const dueInBase = saleInvoice.localDueAmount ?? totalInBase;

    const displayTotals = await buildPdfDisplayTotals(
      this.exchangeRatesService,
      tenantId,
      saleInvoice.currencyCode,
      saleInvoice.invoiceDate,
      totalInBase,
      dueInBase,
      baseCurrency,
      displayCurrencies,
      secondaryCurrency,
    );

    const htmlContent = templateRender('modules/invoice-regular', {
      organization,
      organizationName: organization.metadata.name,
      organizationEmail: organization.metadata.email,
      saleInvoice,
      displayTotals,
      ...i18n,
    });
    const pdfContent = await this.pdfService.pdfDocument(htmlContent);

    return pdfContent;
  }
}
