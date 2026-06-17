import { Module } from '@nestjs/common';
import { TransactionsByCustomersExportInjectable } from './TransactionsByCustomersExportInjectable';
import { TransactionsByCustomersPdf } from './TransactionsByCustomersPdf';
import { TransactionsByCustomersRepository } from './TransactionsByCustomersRepository';
import { TransactionsByCustomersSheet } from './TransactionsByCustomersService';
import { TransactionsByCustomersTableInjectable } from './TransactionsByCustomersTableInjectable';
import { TransactionsByCustomersMeta } from './TransactionsByCustomersMeta';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { FinancialSheetCommonModule } from '../../common/FinancialSheetCommon.module';
import { AccountsModule } from '@/modules/Accounts/Accounts.module';
import { TransactionsByCustomerController } from './TransactionsByCustomer.controller';
import { TransactionsByCustomerApplication } from './TransactionsByCustomersApplication';
import { ExchangeRatesModule } from '@/modules/ExchangeRates/ExchangeRates.module';

@Module({
  imports: [FinancialSheetCommonModule, AccountsModule, ExchangeRatesModule],
  providers: [
    TransactionsByCustomerApplication,
    TransactionsByCustomersRepository,
    TransactionsByCustomersTableInjectable,
    TransactionsByCustomersExportInjectable,
    TransactionsByCustomersSheet,
    TransactionsByCustomersPdf,
    TransactionsByCustomersMeta,
    TenancyContext,
  ],
  controllers: [TransactionsByCustomerController],
})
export class TransactionsByCustomerModule {}
