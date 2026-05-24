import { Service, Inject } from 'typedi';
import moment from 'moment';
import { TenantMetadata } from '@/system/models';
import TenancyService from '@/services/Tenancy/TenancyService';
import FinancialSheet from '../FinancialSheet';

export interface IRealizedGainLossEntry {
  type: 'AR' | 'AP';
  date: string;
  formattedDate: string;
  contactName: string;
  currencyCode: string;
  foreignAmount: number;
  originalRate: number;
  paymentRate: number;
  gainLoss: number;
  formattedForeignAmount: string;
  formattedGainLoss: string;
}

export interface IRealizedGainLossReport {
  entries: IRealizedGainLossEntry[];
  arTotal: number;
  apTotal: number;
  total: number;
  baseCurrency: string;
}

@Service()
export default class RealizedGainLossService extends FinancialSheet {
  @Inject()
  tenancy: TenancyService;

  async realizedGainLoss(
    tenantId: number,
    query: { fromDate: string; toDate: string }
  ): Promise<IRealizedGainLossReport> {
    const tenantMeta = await TenantMetadata.findByTenantId(tenantId);
    const baseCurrency = tenantMeta.baseCurrency;

    const fromDate =
      query.fromDate || moment().startOf('year').format('YYYY-MM-DD');
    const toDate = query.toDate || moment().format('YYYY-MM-DD');

    const { PaymentReceive, BillPayment } = this.tenancy.models(tenantId);

    // Fetch payment receives for foreign currencies in date range
    const payments = await PaymentReceive.query()
      .whereNot('currency_code', baseCurrency)
      .where('currency_code', '!=', '')
      .whereBetween('payment_date', [fromDate, toDate])
      .withGraphFetched('[entries.invoice, customer]');

    // Fetch bill payments for foreign currencies in date range
    const billPayments = await BillPayment.query()
      .whereNot('currency_code', baseCurrency)
      .where('currency_code', '!=', '')
      .whereBetween('payment_date', [fromDate, toDate])
      .withGraphFetched('[entries.bill, vendor]');

    // A/R: gain/loss = paymentAmount/paymentRate - paymentAmount/invoiceRate
    // Indirect quote: 1 base = rate foreign
    // If paymentRate > invoiceRate → foreign weakened → receive less base → loss
    const arEntries: IRealizedGainLossEntry[] = payments.flatMap((payment) =>
      (payment.entries || []).map((entry) => {
        const invoiceRate = entry.invoice?.exchangeRate || payment.exchangeRate;
        const paymentRate = payment.exchangeRate;
        const foreignAmount = entry.paymentAmount;
        const gainLoss = foreignAmount / paymentRate - foreignAmount / invoiceRate;
        return {
          type: 'AR' as const,
          date: moment(payment.paymentDate).format('YYYY-MM-DD'),
          formattedDate: moment(payment.paymentDate).format('YYYY-MM-DD'),
          contactName: payment.customer?.displayName ?? '',
          currencyCode: payment.currencyCode,
          foreignAmount,
          originalRate: invoiceRate,
          paymentRate,
          gainLoss,
          formattedForeignAmount: this.formatNumber(foreignAmount),
          formattedGainLoss: this.formatNumber(gainLoss),
        };
      })
    );

    // A/P: gain/loss = paymentAmount/billRate - paymentAmount/paymentRate
    // If paymentRate > billRate → foreign weakened → pay less base → gain
    const apEntries: IRealizedGainLossEntry[] = billPayments.flatMap(
      (payment) =>
        (payment.entries || []).map((entry) => {
          const billRate = entry.bill?.exchangeRate || payment.exchangeRate;
          const paymentRate = payment.exchangeRate;
          const foreignAmount = entry.paymentAmount;
          const gainLoss = foreignAmount / billRate - foreignAmount / paymentRate;
          return {
            type: 'AP' as const,
            date: moment(payment.paymentDate).format('YYYY-MM-DD'),
            formattedDate: moment(payment.paymentDate).format('YYYY-MM-DD'),
            contactName: payment.vendor?.displayName ?? '',
            currencyCode: payment.currencyCode,
            foreignAmount,
            originalRate: billRate,
            paymentRate,
            gainLoss,
            formattedForeignAmount: this.formatNumber(foreignAmount),
            formattedGainLoss: this.formatNumber(gainLoss),
          };
        })
    );

    const allEntries = [...arEntries, ...apEntries];
    const arTotal = arEntries.reduce((s, e) => s + e.gainLoss, 0);
    const apTotal = apEntries.reduce((s, e) => s + e.gainLoss, 0);
    const total = arTotal + apTotal;

    return { entries: allEntries, arTotal, apTotal, total, baseCurrency };
  }
}
