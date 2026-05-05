import { sumBy, chain, get, head } from 'lodash';
import {
  IJournalEntry,
  IJournalPoster,
  IJournalReportEntry,
  IJournalReportEntriesGroup,
  IJournalReportQuery,
  IJournalReport,
  IContact,
} from '@/interfaces';
import { INumberFormatQuery } from '@/interfaces/FinancialStatements';
import FinancialSheet from '../FinancialSheet';

export default class JournalSheet extends FinancialSheet {
  readonly tenantId: number;
  readonly journal: IJournalPoster;
  readonly query: IJournalReportQuery;
  readonly baseCurrency: string;
  readonly contactsById: Map<number | string, IContact>;

  // Shadow the base class readonly so the constructor can assign from query.
  declare numberFormat: INumberFormatQuery;

  // Populated in constructor — not declared in the base class.
  accountsGraph: any;
  i18n: any;

  /**
   * Constructor method.
   */
  constructor(
    tenantId: number,
    query: IJournalReportQuery,
    journal: IJournalPoster,
    accountsGraph: any,
    contactsById: Map<number | string, IContact>,
    baseCurrency: string,
    i18n: any,
  ) {
    super();

    this.tenantId = tenantId;
    this.journal = journal;
    this.query = query;
    this.numberFormat = this.query.numberFormat as any;
    this.accountsGraph = accountsGraph;
    this.contactsById = contactsById;
    this.baseCurrency = baseCurrency;
    this.i18n = i18n;
  }

  /**
   * Entry mapper.
   */
  entryMapper(entry: IJournalEntry): IJournalReportEntry {
    const accountId = entry.accountId ?? entry.account;
    const account = this.accountsGraph.getNodeData(accountId);
    const contact = this.contactsById.get(entry.contactId);

    const foreignCurrencyCode = entry.currencyCode ?? this.baseCurrency;
    const exchangeRate = entry.exchangeRate ?? 1;
    const isForeign = foreignCurrencyCode !== this.baseCurrency && exchangeRate !== 1;

    const foreignCredit = isForeign ? entry.credit / exchangeRate : null;
    const foreignDebit  = isForeign ? entry.debit  / exchangeRate : null;

    return {
      entryId: entry.id,
      index: entry.index,
      note: entry.note,

      contactName: get(contact, 'displayName'),
      contactType: get(contact, 'contactService'),

      accountName: account.name,
      accountCode: account.code,
      transactionNumber: entry.transactionNumber,

      currencyCode: this.baseCurrency,
      formattedCredit: this.formatNumber(entry.credit),
      formattedDebit: this.formatNumber(entry.debit),
      credit: entry.credit,
      debit: entry.debit,

      foreignCurrencyCode,
      exchangeRate,
      foreignCredit,
      foreignDebit,
      formattedForeignCredit: foreignCredit !== null ? this.formatNumber(foreignCredit) : null,
      formattedForeignDebit:  foreignDebit  !== null ? this.formatNumber(foreignDebit)  : null,

      createdAt: entry.createdAt,
    };
  }

  /**
   * Maps the journal entries.
   */
  entriesMapper(entries: IJournalEntry[]): IJournalReportEntry[] {
    return entries.map(this.entryMapper.bind(this));
  }

  /**
   * Mapping journal entries groups.
   */
  entriesGroupsMapper(
    entriesGroup: IJournalEntry[],
    groupEntry: IJournalEntry,
  ): IJournalReportEntriesGroup {
    const totalCredit = sumBy(entriesGroup, 'credit');
    const totalDebit = sumBy(entriesGroup, 'debit');

    return {
      date: groupEntry.date,
      referenceType: groupEntry.referenceType,
      referenceId: groupEntry.referenceId,
      referenceTypeFormatted: this.i18n.__(groupEntry.referenceTypeFormatted),

      entries: this.entriesMapper(entriesGroup),

      currencyCode: this.baseCurrency,

      credit: totalCredit,
      debit: totalDebit,

      formattedCredit: this.formatTotalNumber(totalCredit),
      formattedDebit: this.formatTotalNumber(totalDebit),
    } as IJournalReportEntriesGroup;
  }

  /**
   * Mapping the journal entries to entries groups.
   */
  entriesWalker(entries: IJournalEntry[]): IJournalReportEntriesGroup[] {
    return chain(entries)
      .groupBy((entry) => `${entry.referenceId}-${entry.referenceType}`)
      .map((entriesGroup: IJournalEntry[]) => {
        const headEntry = head(entriesGroup);
        return this.entriesGroupsMapper(entriesGroup, headEntry);
      })
      .value() as IJournalReportEntriesGroup[];
  }

  /**
   * Retrieve journal report.
   */
  reportData(): IJournalReport {
    return { entries: this.entriesWalker(this.journal.entries) };
  }
}
