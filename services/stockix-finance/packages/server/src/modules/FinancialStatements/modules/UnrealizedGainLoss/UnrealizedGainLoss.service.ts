import { Inject, Injectable } from '@nestjs/common';
import moment from 'moment';
import { FinancialSheet } from '../../common/FinancialSheet';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { SaleInvoice } from '@/modules/SaleInvoices/models/SaleInvoice';
import { Bill } from '@/modules/Bills/models/Bill';
import { ExchangeRateModel } from '@/modules/ExchangeRates/models/ExchangeRate.model';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import {
  IUnrealizedGainLossEntry,
  IUnrealizedGainLossQuery,
  IUnrealizedGainLossReport,
} from './UnrealizedGainLoss.types';

@Injectable()
export class UnrealizedGainLossService extends FinancialSheet {
  constructor(
    private readonly tenancyContext: TenancyContext,

    @Inject(SaleInvoice.name)
    private readonly saleInvoiceModel: TenantModelProxy<typeof SaleInvoice>,

    @Inject(Bill.name)
    private readonly billModel: TenantModelProxy<typeof Bill>,

    @Inject(ExchangeRateModel.name)
    private readonly exchangeRateModel: TenantModelProxy<
      typeof ExchangeRateModel
    >,
  ) {
    super();
  }

  public async unrealizedGainLoss(
    query: IUnrealizedGainLossQuery,
  ): Promise<IUnrealizedGainLossReport> {
    const tenantMetadata = await this.tenancyContext.getTenantMetadata();
    const baseCurrency = tenantMetadata.baseCurrency;
    this.baseCurrency = baseCurrency;

    const asOfDate = query.asOfDate ?? moment().format('YYYY-MM-DD');

    const foreignInvoices = await this.saleInvoiceModel()
      .query()
      .whereNot('currencyCode', baseCurrency)
      .where('currencyCode', '!=', '')
      .withGraphFetched('customer');

    const openInvoices = foreignInvoices.filter((invoice) => invoice.dueAmount > 0);

    const foreignBills = await this.billModel()
      .query()
      .whereNot('currencyCode', baseCurrency)
      .where('currencyCode', '!=', '')
      .withGraphFetched('vendor');

    const openBills = foreignBills.filter((bill) => bill.dueAmount > 0);

    const currencies = [
      ...new Set([
        ...openInvoices.map((invoice) => invoice.currencyCode),
        ...openBills.map((bill) => bill.currencyCode),
      ]),
    ].filter(Boolean);

    const currentRates = await this.fetchRatesAsOf(currencies, asOfDate);

    const arEntries: IUnrealizedGainLossEntry[] = openInvoices.map((invoice) => {
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
        contactName: (invoice as SaleInvoice & { customer?: { displayName?: string } }).customer?.displayName ?? '',
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
    });

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
        contactName: (bill as Bill & { vendor?: { displayName?: string } }).vendor?.displayName ?? '',
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

    const arTotal = arEntries.reduce((sum, entry) => sum + entry.gainLoss, 0);
    const apTotal = apEntries.reduce((sum, entry) => sum + entry.gainLoss, 0);

    return {
      entries: [...arEntries, ...apEntries],
      arTotal,
      apTotal,
      total: arTotal + apTotal,
      baseCurrency,
    };
  }

  private async fetchRatesAsOf(
    currencies: string[],
    asOfDate: string,
  ): Promise<Record<string, number>> {
    const rates: Record<string, number> = {};

    await Promise.all(
      currencies.map(async (currency) => {
        const row = await this.exchangeRateModel()
          .query()
          .where('currencyCode', currency)
          .where('date', '<=', asOfDate)
          .orderBy('date', 'desc')
          .first();

        if (row) {
          rates[currency] = Number(row.exchangeRate);
        }
      }),
    );

    return rates;
  }
}
