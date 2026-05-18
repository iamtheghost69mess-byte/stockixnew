import { Service, Inject } from 'typedi';
import moment from 'moment';
import { TenantMetadata } from '@/system/models';
import TenancyService from '@/services/Tenancy/TenancyService';
import FinancialSheet from '../FinancialSheet';

export interface IUnrealizedGainLossEntry {
  type: 'AR' | 'AP';
  referenceType: string;
  referenceId: number;
  date: string;
  formattedDate: string;
  contactName: string;
  currencyCode: string;
  foreignDueAmount: number;
  originalRate: number;
  currentRate: number;
  originalLocalAmount: number;
  currentLocalAmount: number;
  gainLoss: number;
  formattedForeignDueAmount: string;
  formattedOriginalLocalAmount: string;
  formattedCurrentLocalAmount: string;
  formattedGainLoss: string;
}

export interface IUnrealizedGainLossReport {
  entries: IUnrealizedGainLossEntry[];
  arTotal: number;
  apTotal: number;
  total: number;
  baseCurrency: string;
}

@Service()
export default class UnrealizedGainLossService extends FinancialSheet {
  @Inject()
  tenancy: TenancyService;

  async unrealizedGainLoss(
    tenantId: number,
    query: { asOfDate?: string }
  ): Promise<IUnrealizedGainLossReport> {
    const tenantMeta = await TenantMetadata.findByTenantId(tenantId);
    const baseCurrency = tenantMeta.baseCurrency;
    const asOfDate = query.asOfDate || moment().format('YYYY-MM-DD');

    const { SaleInvoice, Bill, ExchangeRate } = this.tenancy.models(tenantId);

    // Fetch open foreign-currency invoices (A/R)
    const foreignInvoices = await SaleInvoice.query()
      .whereNot('currency_code', baseCurrency)
      .where('currency_code', '!=', '')
      .withGraphFetched('customer');

    const openInvoices = foreignInvoices.filter((inv) => inv.dueAmount > 0);

    // Fetch open foreign-currency bills (A/P)
    const foreignBills = await Bill.query()
      .whereNot('currency_code', baseCurrency)
      .where('currency_code', '!=', '')
      .withGraphFetched('vendor');

    const openBills = foreignBills.filter((bill) => bill.dueAmount > 0);

    // Collect unique currencies and fetch their current rates
    const currencies = [
      ...new Set([
        ...openInvoices.map((i) => i.currencyCode),
        ...openBills.map((b) => b.currencyCode),
      ]),
    ].filter(Boolean);

    const currentRates = await this.fetchRatesAsOf(
      ExchangeRate,
      currencies,
      asOfDate
    );

    // Compute A/R entries
    // A/R gain/loss: currentLocalDue - originalLocalDue
    // Positive = gain (foreign currency strengthened vs base)
    const arEntries: IUnrealizedGainLossEntry[] = openInvoices.map(
      (invoice) => {
        const currentRate =
          currentRates[invoice.currencyCode] ?? invoice.exchangeRate;
        const originalLocalAmount = invoice.dueAmount / invoice.exchangeRate;
        const currentLocalAmount = invoice.dueAmount / currentRate;
        const gainLoss = currentLocalAmount - originalLocalAmount;
        return {
          type: 'AR',
          referenceType: 'SaleInvoice',
          referenceId: invoice.id,
          date: moment(invoice.invoiceDate).format('YYYY-MM-DD'),
          formattedDate: moment(invoice.invoiceDate).format('YYYY-MM-DD'),
          contactName: invoice.customer?.displayName ?? '',
          currencyCode: invoice.currencyCode,
          foreignDueAmount: invoice.dueAmount,
          originalRate: invoice.exchangeRate,
          currentRate,
          originalLocalAmount,
          currentLocalAmount,
          gainLoss,
          formattedForeignDueAmount: this.formatNumber(invoice.dueAmount),
          formattedOriginalLocalAmount: this.formatNumber(originalLocalAmount),
          formattedCurrentLocalAmount: this.formatNumber(currentLocalAmount),
          formattedGainLoss: this.formatNumber(gainLoss),
        };
      }
    );

    // Compute A/P entries
    // A/P gain/loss: originalLocalDue - currentLocalDue
    // We owe the foreign amount; if foreign weakened, we pay less base = gain
    const apEntries: IUnrealizedGainLossEntry[] = openBills.map((bill) => {
      const currentRate = currentRates[bill.currencyCode] ?? bill.exchangeRate;
      const originalLocalAmount = bill.dueAmount / bill.exchangeRate;
      const currentLocalAmount = bill.dueAmount / currentRate;
      const gainLoss = originalLocalAmount - currentLocalAmount;
      return {
        type: 'AP',
        referenceType: 'Bill',
        referenceId: bill.id,
        date: moment(bill.billDate).format('YYYY-MM-DD'),
        formattedDate: moment(bill.billDate).format('YYYY-MM-DD'),
        contactName: bill.vendor?.displayName ?? '',
        currencyCode: bill.currencyCode,
        foreignDueAmount: bill.dueAmount,
        originalRate: bill.exchangeRate,
        currentRate,
        originalLocalAmount,
        currentLocalAmount,
        gainLoss,
        formattedForeignDueAmount: this.formatNumber(bill.dueAmount),
        formattedOriginalLocalAmount: this.formatNumber(originalLocalAmount),
        formattedCurrentLocalAmount: this.formatNumber(currentLocalAmount),
        formattedGainLoss: this.formatNumber(gainLoss),
      };
    });

    const allEntries = [...arEntries, ...apEntries];
    const arTotal = arEntries.reduce((s, e) => s + e.gainLoss, 0);
    const apTotal = apEntries.reduce((s, e) => s + e.gainLoss, 0);
    const total = arTotal + apTotal;

    return {
      entries: allEntries,
      arTotal,
      apTotal,
      total,
      baseCurrency,
    };
  }

  private async fetchRatesAsOf(
    ExchangeRate,
    currencies: string[],
    asOfDate: string
  ): Promise<Record<string, number>> {
    const rates: Record<string, number> = {};
    await Promise.all(
      currencies.map(async (currency) => {
        const row = await ExchangeRate.query()
          .where('currency_code', currency)
          .where('date', '<=', asOfDate)
          .orderBy('date', 'desc')
          .first();
        if (row) rates[currency] = Number(row.exchangeRate);
      })
    );
    return rates;
  }
}
