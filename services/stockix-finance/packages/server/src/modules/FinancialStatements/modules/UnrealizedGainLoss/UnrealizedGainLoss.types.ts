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

export interface IUnrealizedGainLossQuery {
  asOfDate?: string;
}
