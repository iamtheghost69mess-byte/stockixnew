export interface IJournalReportQuery {
  fromDate: Date | string,
  toDate: Date | string,
  numberFormat: {
    noCents: boolean,
    divideOn1000: boolean,
  },
  transactionType: string,
  transactionId: string,

  accountsIds: number | number[],
  fromRange: number,
  toRange: number,
}

export interface IJournalReportEntry {
  entryId: number,
  index?: number,
  note?: string,
  contactName?: string,
  contactType?: string,
  accountName: string,
  accountCode: string,
  transactionNumber?: string,
  currencyCode: string,
  credit: number,
  debit: number,
  formattedCredit: string,
  formattedDebit: string,
  foreignCurrencyCode: string,
  exchangeRate: number,
  foreignCredit: number | null,
  foreignDebit: number | null,
  formattedForeignCredit: string | null,
  formattedForeignDebit: string | null,
  createdAt?: Date,
}

export interface IJournalReportEntriesGroup {
  id?: string,
  entries: IJournalReportEntry[],
  currencyCode: string,
  credit: number,
  debit: number,
  formattedCredit: string,
  formattedDebit: string,
}

export interface IJournalReport {
  entries: IJournalReportEntriesGroup[],
}

export interface IJournalSheetMeta {
  isCostComputeRunning: boolean,
  organizationName: string,
  baseCurrency: string,
}