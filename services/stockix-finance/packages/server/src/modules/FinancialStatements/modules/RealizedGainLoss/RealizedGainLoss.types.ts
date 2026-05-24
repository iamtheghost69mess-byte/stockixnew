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

export interface IRealizedGainLossQuery {
  fromDate?: string;
  toDate?: string;
}
