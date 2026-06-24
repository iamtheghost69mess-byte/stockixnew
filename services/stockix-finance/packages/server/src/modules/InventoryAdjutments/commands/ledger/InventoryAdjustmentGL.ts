import * as R from 'ramda';
import { InventoryAdjustment } from '../../models/InventoryAdjustment';
import { InventoryAdjustmentEntry } from '../../models/InventoryAdjustmentEntry';
import { ILedgerEntry } from '../../../Ledger/types/Ledger.types';
import { AccountNormal } from '@/interfaces/Account';
import { Ledger } from '../../../Ledger/Ledger';

export class InventoryAdjustmentsGL {
  private inventoryAdjustment: InventoryAdjustment;
  private baseCurrency: string;
  private _currencyCode: string;
  private _exchangeRate: number;

  constructor(inventoryAdjustmentModel: InventoryAdjustment) {
    this.inventoryAdjustment = inventoryAdjustmentModel;
  }

  /**
   * Sets the base currency.
   * @param {string} baseCurrency - Base currency.
   * @returns {InventoryAdjustmentsGL}
   */
  public setBaseCurrency(baseCurrency: string) {
    this.baseCurrency = baseCurrency;
    return this;
  }

  /**
   * Sets the transaction currency and exchange rate (Direct Quote: 1 foreign = X base).
   * When not called, defaults to base currency at rate 1.
   * @param {string} currencyCode - ISO 4217 currency code.
   * @param {number} exchangeRate - How many base units equal 1 unit of currencyCode.
   * @returns {InventoryAdjustmentsGL}
   */
  public setCurrency(currencyCode: string, exchangeRate: number) {
    this._currencyCode = currencyCode;
    this._exchangeRate = exchangeRate;
    return this;
  }

  /**
   * Retrieves the inventory adjustment common GL entry.
   * @returns {ILedgerEntry}
   */
  private get adjustmentGLCommonEntry() {
    return {
      currencyCode: this._currencyCode ?? this.baseCurrency,
      exchangeRate: this._exchangeRate ?? 1,

      transactionId: this.inventoryAdjustment.id,
      transactionType: 'InventoryAdjustment',
      referenceNumber: this.inventoryAdjustment.referenceNo,

      date: this.inventoryAdjustment.date,

      userId: this.inventoryAdjustment.userId,
      branchId: this.inventoryAdjustment.branchId,

      createdAt: this.inventoryAdjustment.createdAt,

      credit: 0,
      debit: 0,
    };
  }

  /**
   * Retrieve the inventory adjustment inventory GL entry.
   * @param {InventoryAdjustmentEntry} entry - Inventory adjustment entry.
   * @param {number} index - Entry index.
   * @returns {ILedgerEntry}
   */
  private getAdjustmentGLInventoryEntry = R.curry(
    (entry: InventoryAdjustmentEntry, index: number): ILedgerEntry => {
      const commonEntry = this.adjustmentGLCommonEntry;
      const amount = entry.cost * entry.quantity;

      return {
        ...commonEntry,
        debit: amount,
        accountId: entry.item.inventoryAccountId,
        accountNormal: AccountNormal.DEBIT,
        index,
      };
    },
  );

  /**
   * Retrieves the inventory adjustment
   * @param   {IInventoryAdjustment} inventoryAdjustment
   * @param   {IInventoryAdjustmentEntry} entry
   * @returns {ILedgerEntry}
   */
  private getAdjustmentGLCostEntry(
    entry: InventoryAdjustmentEntry,
    index: number,
  ): ILedgerEntry {
    const commonEntry = this.adjustmentGLCommonEntry;
    const amount = entry.cost * entry.quantity;

    return {
      ...commonEntry,
      accountId: this.inventoryAdjustment.adjustmentAccountId,
      accountNormal: AccountNormal.DEBIT,
      credit: amount,
      index: index + 2,
    };
  }

  /**
   * Retrieve the inventory adjustment GL item entry.
   * @param {InventoryAdjustmentEntry} entry - Inventory adjustment entry.
   * @param {number} index - Entry index.
   * @returns {ILedgerEntry[]}
   */
  private getAdjustmentGLItemEntry(
    entry: InventoryAdjustmentEntry,
    index: number,
  ): ILedgerEntry[] {
    const getInventoryEntry = this.getAdjustmentGLInventoryEntry();
    const inventoryEntry = getInventoryEntry(entry, index);
    const costEntry = this.getAdjustmentGLCostEntry(entry, index);

    return [inventoryEntry, costEntry];
  }

  /**
   * Writes increment inventroy adjustment GL entries.
   * @param   {InventoryAdjustment} inventoryAdjustment -
   * @param   {JournalPoster} jorunal -
   * @returns {ILedgerEntry[]}
   */
  public getIncrementAdjustmentGLEntries(): ILedgerEntry[] {
    return this.inventoryAdjustment.entries
      .map((entry, index) => this.getAdjustmentGLItemEntry(entry, index))
      .flat();
  }

  public getAdjustmentGL(): Ledger {
    const entries = this.getIncrementAdjustmentGLEntries();

    return new Ledger(entries);
  }
}
