import * as async from 'async';
import { Knex } from 'knex';
import { uniq } from 'lodash';
import { Inject, Injectable } from '@nestjs/common';
import { ILedger, ISaveAccountsBalanceQueuePayload } from './types/Ledger.types';
import { Account } from '../Accounts/models/Account.model';
import { TenancyContext } from '../Tenancy/TenancyContext.service';
import { TenantModelProxy } from '../System/models/TenantBaseModel';

@Injectable()
export class LedegrAccountsStorage {
  constructor(
    private readonly tenancyContext: TenancyContext,

    @Inject(Account.name)
    private readonly accountModel: TenantModelProxy<typeof Account>,
  ) {}

  private getDependantsAccountsIds = (
    accountsIds: number[],
    depGraph,
  ): number[] => {
    const depAccountsIds: number[] = [];
    accountsIds.forEach((accountId: number) => {
      const depAccountIds = depGraph.dependantsOf(accountId);
      depAccountsIds.push(accountId, ...depAccountIds);
    });
    return uniq(depAccountsIds);
  };

  private findDependantsAccountsIds = async (
    accountsIds: number[],
    trx?: Knex.Transaction,
  ): Promise<number[]> => {
    const accounts = await this.accountModel().query(trx);
    const accountsGraph = Account.toDependencyGraph(accounts);
    return this.getDependantsAccountsIds(accountsIds, accountsGraph);
  };

  public saveAccountsBalance = async (
    ledger: ILedger,
    trx?: Knex.Transaction,
  ): Promise<void> => {
    const saveAccountsBalanceQueue = async.queue(
      this.saveAccountBalanceTask,
      10,
    );
    const effectedAccountsIds = ledger.getAccountsIds();
    const dependAccountsIds = await this.findDependantsAccountsIds(
      effectedAccountsIds,
      trx,
    );
    dependAccountsIds.forEach((accountId: number) => {
      saveAccountsBalanceQueue.push({ ledger, accountId, trx });
    });
    if (dependAccountsIds.length > 0) {
      await saveAccountsBalanceQueue.drain();
    }
  };

  private saveAccountBalanceTask = async (
    task: ISaveAccountsBalanceQueuePayload,
  ): Promise<void> => {
    const { ledger, accountId, trx } = task;
    await this.saveAccountBalanceFromLedger(ledger, accountId, trx);
  };

  private saveAccountBalanceFromLedger = async (
    ledger: ILedger,
    accountId: number,
    trx?: Knex.Transaction,
  ): Promise<void> => {
    const account = await this.accountModel().query(trx).findById(accountId);
    const accountLedger = ledger.whereAccountId(accountId);
    const tenant = await this.tenancyContext.getTenant(true);
    const isAccountForeign =
      account.currencyCode !== tenant?.metadata?.baseCurrency;
    const closingBalance = isAccountForeign
      ? accountLedger
          .whereCurrencyCode(account.currencyCode)
          .getForeignClosingBalance()
      : accountLedger.getClosingBalance();

    await this.saveAccountBalance(accountId, closingBalance, trx);
  };

  private saveAccountBalance = async (
    accountId: number,
    change: number,
    trx?: Knex.Transaction,
  ): Promise<void> => {
    await this.accountModel()
      .query(trx)
      .findById(accountId)
      .whereNull('amount')
      .patch({ amount: 0 });

    await this.accountModel()
      .query(trx)
      .changeAmount({ id: accountId }, 'amount', change);
  };
}
