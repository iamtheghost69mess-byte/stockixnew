import { Knex } from 'knex';
export interface ILedger {
  entries: ILedgerEntry[];

  getEntries(): ILedgerEntry[];

  filter(cb: (entry: ILedgerEntry) => boolean): ILedger;

  whereAccountId(accountId: number): ILedger;
  whereContactId(contactId: number): ILedger;
  whereFromDate(fromDate: Date | string): ILedger;
  whereToDate(toDate: Date | string): ILedger;
  whereCurrencyCode(currencyCode: string): ILedger;
  whereBranch(branchId: number): ILedger;
  whereItem(itemId: number): ILedger;

  getClosingBalance(): number;
  getForeignClosingBalance(): number;

  getContactsIds(): number[];
  getAccountsIds(): number[];
}

export interface ICommonLedgerEntry {
  credit: number;
  debit: number;
  currencyCode: string;
  exchangeRate: number;
  transactionType: string;
  transactionId: number;
  date: Date | string;
  userId?: number;
  branchId?: number;
  transactionNumber?: string;
  referenceNumber?: string;
  createdAt?: Date;
  indexGroup?: number;
}

export interface ILedgerEntry extends ICommonLedgerEntry {
  accountId?: number;
  accountNormal: string;
  contactId?: number;
  index: number;
  note?: string;
  itemId?: number;
  projectId?: number;
  itemQuantity?: number;
  entryId?: number;
  costable?: boolean;
}

export interface ISaveLedgerEntryQueuePayload {
  tenantId: number;
  entry: ILedgerEntry;
  trx?: Knex.Transaction;
}

export interface ISaveAccountsBalanceQueuePayload {
  ledger: ILedger;
  accountId: number;
  trx?: Knex.Transaction;
}

export interface ISaleContactsBalanceQueuePayload {
  ledger: ILedger;
  tenantId: number;
  contactId: number;
  trx?: Knex.Transaction;
}
