import { Inject, Injectable } from '@nestjs/common';
import moment from 'moment';
import { FinancialSheet } from '../../common/FinancialSheet';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { PaymentReceived } from '@/modules/PaymentReceived/models/PaymentReceived';
import { BillPayment } from '@/modules/BillPayments/models/BillPayment';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import {
  IRealizedGainLossEntry,
  IRealizedGainLossQuery,
  IRealizedGainLossReport,
} from './RealizedGainLoss.types';

@Injectable()
export class RealizedGainLossService extends FinancialSheet {
  constructor(
    private readonly tenancyContext: TenancyContext,

    @Inject(PaymentReceived.name)
    private readonly paymentReceiveModel: TenantModelProxy<
      typeof PaymentReceived
    >,

    @Inject(BillPayment.name)
    private readonly billPaymentModel: TenantModelProxy<typeof BillPayment>,
  ) {
    super();
  }

  public async realizedGainLoss(
    query: IRealizedGainLossQuery,
  ): Promise<IRealizedGainLossReport> {
    const tenantMetadata = await this.tenancyContext.getTenantMetadata();
    const baseCurrency = tenantMetadata.baseCurrency;
    this.baseCurrency = baseCurrency;

    const fromDate =
      query.fromDate ?? moment().startOf('year').format('YYYY-MM-DD');
    const toDate = query.toDate ?? moment().format('YYYY-MM-DD');

    const payments = await this.paymentReceiveModel()
      .query()
      .whereNot('currencyCode', baseCurrency)
      .where('currencyCode', '!=', '')
      .whereBetween('paymentDate', [fromDate, toDate])
      .withGraphFetched('[entries.invoice, customer]');

    const billPayments = await this.billPaymentModel()
      .query()
      .whereNot('currencyCode', baseCurrency)
      .where('currencyCode', '!=', '')
      .whereBetween('paymentDate', [fromDate, toDate])
      .withGraphFetched('[entries.bill, vendor]');

    const arEntries: IRealizedGainLossEntry[] = payments.flatMap((payment) =>
      (payment.entries ?? []).map((entry) => {
        const invoiceRate =
          entry.invoice?.exchangeRate ?? payment.exchangeRate;
        const paymentRate = payment.exchangeRate;
        const foreignAmount = entry.paymentAmount;
        const gainLoss =
          foreignAmount / paymentRate - foreignAmount / invoiceRate;

        return {
          type: 'AR' as const,
          date: moment(payment.paymentDate).format('YYYY-MM-DD'),
          formattedDate: moment(payment.paymentDate).format('YYYY-MM-DD'),
          contactName: (payment as PaymentReceived & { customer?: { displayName?: string } }).customer?.displayName ?? '',
          currencyCode: payment.currencyCode,
          foreignAmount,
          originalRate: invoiceRate,
          paymentRate,
          gainLoss,
          formattedForeignAmount: this.formatNumber(foreignAmount),
          formattedGainLoss: this.formatNumber(gainLoss),
        };
      }),
    );

    const apEntries: IRealizedGainLossEntry[] = billPayments.flatMap(
      (payment) =>
        (payment.entries ?? []).map((entry) => {
          const billRate = entry.bill?.exchangeRate ?? payment.exchangeRate;
          const paymentRate = payment.exchangeRate;
          const foreignAmount = entry.paymentAmount;
          const gainLoss =
            foreignAmount / billRate - foreignAmount / paymentRate;

          return {
            type: 'AP' as const,
            date: moment(payment.paymentDate).format('YYYY-MM-DD'),
            formattedDate: moment(payment.paymentDate).format('YYYY-MM-DD'),
            contactName: (payment as BillPayment & { vendor?: { displayName?: string } }).vendor?.displayName ?? '',
            currencyCode: payment.currencyCode,
            foreignAmount,
            originalRate: billRate,
            paymentRate,
            gainLoss,
            formattedForeignAmount: this.formatNumber(foreignAmount),
            formattedGainLoss: this.formatNumber(gainLoss),
          };
        }),
    );

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
}
