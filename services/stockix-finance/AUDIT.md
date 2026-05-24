# AUDIT.md — Phase A Pre-Implementation Inventory
# Generated: 2026-05-16
# Audited by: Cursor Agent
# Codebase: services/stockix-finance (Bigcapital v0.22.0 fork)

---

## Section 1 — Real file tree (verbatim find output)

Working directory: `services/stockix-finance` (paths below are relative to this directory).

### `find packages/server/src -type f -name "*.ts" | sort`

```
packages/server/src/cli.ts
packages/server/src/common/config/app.ts
packages/server/src/common/config/bankfeed.ts
packages/server/src/common/config/bull-board.ts
packages/server/src/common/config/cloud.ts
packages/server/src/common/config/gotenberg.ts
packages/server/src/common/config/index.ts
packages/server/src/common/config/inventory.ts
packages/server/src/common/config/jwt.ts
packages/server/src/common/config/lemonsqueezy.ts
packages/server/src/common/config/loops.ts
packages/server/src/common/config/mail.ts
packages/server/src/common/config/open-exchange.ts  
packages/server/src/common/config/plaid.ts
packages/server/src/common/config/posthog.ts
packages/server/src/common/config/queue.ts
packages/server/src/common/config/redis.ts
packages/server/src/common/config/s3.ts
packages/server/src/common/config/signup.ts
packages/server/src/common/config/signup-confirmation.ts
packages/server/src/common/config/signup-restrictions.ts
packages/server/src/common/config/stripe-payment.ts
packages/server/src/common/config/system-database.ts
packages/server/src/common/config/tenant-database.ts
packages/server/src/common/config/throttle.ts
packages/server/src/common/constants/files.constants.ts
packages/server/src/common/constants/http.constants.ts
packages/server/src/common/constants/multer.constants.ts
packages/server/src/common/constants/multer.utils.ts
packages/server/src/common/decorators/ApiCommonHeaders.ts
packages/server/src/common/decorators/LockMutateBaseCurrency.decorator.ts
packages/server/src/common/decorators/Validators.ts
packages/server/src/common/dtos/BulkDelete.dto.ts
packages/server/src/common/dtos/PaginatedResults.dto.ts
packages/server/src/common/events/events.ts
packages/server/src/common/exceptions/ModelEntityNotFound.ts
packages/server/src/common/exceptions/ModelHasRelations.exception.ts
packages/server/src/common/filters/model-has-relations.filter.ts
packages/server/src/common/filters/service-error.filter.ts
packages/server/src/common/interceptors/file.interceptor.ts
packages/server/src/common/interceptors/serialize.interceptor.ts
packages/server/src/common/interceptors/to-json.interceptor.ts
packages/server/src/common/pipes/ClassValidation.pipe.ts
packages/server/src/common/pipes/ZodValidation.pipe.ts
packages/server/src/common/repository/CachableRepository.ts
packages/server/src/common/repository/EntityRepository.ts
packages/server/src/common/repository/TenantRepository.ts
packages/server/src/common/types/Constructor.ts
packages/server/src/common/types/Date.ts
packages/server/src/common/types/Discount.ts
packages/server/src/common/types/Features.ts
packages/server/src/common/types/Objection.d.ts
packages/server/src/constants/accept-type.ts
packages/server/src/constants/accounts.ts
packages/server/src/constants/data-types.ts
packages/server/src/constants/metable-options.ts
packages/server/src/database/tenant/migrations/20190822214303_create_accounts_table.ts
packages/server/src/database/tenant/migrations/20190822214304_create_items_categories_table.ts
packages/server/src/database/tenant/migrations/20190822214306_create_items_table.ts
packages/server/src/database/tenant/migrations/20190822214903_create_views_table.ts
packages/server/src/database/tenant/migrations/20190822214904_create_settings_table.ts
packages/server/src/database/tenant/migrations/20190822214905_create_views_columns.ts
packages/server/src/database/tenant/migrations/20190822214905_create_views_roles_table.ts
packages/server/src/database/tenant/migrations/20200104232644_create_contacts_table.ts
packages/server/src/database/tenant/migrations/20200104232647_create_accounts_transactions_table.ts
packages/server/src/database/tenant/migrations/20200105014405_create_expenses_table.ts
packages/server/src/database/tenant/migrations/20200105195823_create_manual_journals_table.ts
packages/server/src/database/tenant/migrations/20200105195825_create_manual_journals_entries_table.ts
packages/server/src/database/tenant/migrations/20200419171451_create_currencies_table.ts
packages/server/src/database/tenant/migrations/20200419191832_create_exchange_rates_table.ts
packages/server/src/database/tenant/migrations/20200423201600_create_media_table.ts
packages/server/src/database/tenant/migrations/20200503032011_create_media_links_table.ts
packages/server/src/database/tenant/migrations/20200606113848_create_expense_transactions_categories_table.ts
packages/server/src/database/tenant/migrations/20200713192127_create_sales_estimates_table.ts
packages/server/src/database/tenant/migrations/20200713213303_create_sales_receipt_table.ts
packages/server/src/database/tenant/migrations/20200715193633_create_sale_invoices_table.ts
packages/server/src/database/tenant/migrations/20200715194514_create_payment_receives_table.ts
packages/server/src/database/tenant/migrations/20200718161031_create_payment_receives_entries_table.ts
packages/server/src/database/tenant/migrations/20200719152005_create_bills_table.ts
packages/server/src/database/tenant/migrations/20200719153909_create_bills_payments_table.ts
packages/server/src/database/tenant/migrations/20200722164251_create_inventory_transactions_table.ts
packages/server/src/database/tenant/migrations/20200722164252_create_landed_cost_table.ts
packages/server/src/database/tenant/migrations/20200722164253_create_landed_cost_entries_table.ts
packages/server/src/database/tenant/migrations/20200722164255_create_inventory_transaction_meta_table.ts
packages/server/src/database/tenant/migrations/20200722173423_create_items_entries_table.ts
packages/server/src/database/tenant/migrations/20200728161617_create_bill_payments_entries.ts
packages/server/src/database/tenant/migrations/20200810121807_create_inventory_cost_lot_tracker_table.ts
packages/server/src/database/tenant/migrations/20200810121809_create_inventory_adjustments_table.ts
packages/server/src/database/tenant/migrations/20200810121810_create_inventory_adjustments_entries_table.ts
packages/server/src/database/tenant/migrations/20200810121910_create_cashflow_transactions_table.ts
packages/server/src/database/tenant/migrations/20210810121910_create_cashflow_transaction_lines_table.ts
packages/server/src/database/tenant/migrations/20210910121910_add_invoices_writtenoff_columns.ts
packages/server/src/database/tenant/migrations/20211012121910_add_costable_column_to_account_transactions.ts
packages/server/src/database/tenant/migrations/20211014121910_add_roles_table.ts
packages/server/src/database/tenant/migrations/20211112121920_create_users_table.ts
packages/server/src/database/tenant/migrations/20211122121920_create_credit_notes_table.ts
packages/server/src/database/tenant/migrations/20211122121920_create_vendor_credits_table.ts
packages/server/src/database/tenant/migrations/20211123121920_create_refund_transactions_table.ts
packages/server/src/database/tenant/migrations/20211124121920_create_credit_note_applies_invoices.ts
packages/server/src/database/tenant/migrations/20220124121920_create_branches_table.ts
packages/server/src/database/tenant/migrations/20220124121920_create_warehouses_table.ts
packages/server/src/database/tenant/migrations/20220125021920_create_items_warehouses_quantity.ts
packages/server/src/database/tenant/migrations/20220125121920_add_branch_column_to_accounts_transactions.ts
packages/server/src/database/tenant/migrations/20220125121920_add_branch_warehouse_columns_to_purchases.ts
packages/server/src/database/tenant/migrations/20220125121920_add_branch_warehouse_columns_to_sales.ts
packages/server/src/database/tenant/migrations/20220125121920_add_warehouse_column_to_inventory_transactions.ts
packages/server/src/database/tenant/migrations/20220125121920_add_warehouse_column_to_items_entries.ts
packages/server/src/database/tenant/migrations/20220128121920_add_exchange_rate_to_transactions.ts
packages/server/src/database/tenant/migrations/20220129121920_add_writtenoff_expense_account_to_invoices.ts
packages/server/src/database/tenant/migrations/20220229121920_rename_contacts_shipping_billing_addresses.ts
packages/server/src/database/tenant/migrations/20220329121920_add_cashflow_credit_account.ts
packages/server/src/database/tenant/migrations/20220329121920_add_seed_at_column_to_accounts.ts
packages/server/src/database/tenant/migrations/20220429121920_create_projects_table.ts
packages/server/src/database/tenant/migrations/20220429121922_add_project_id_to_expense_lines.ts
packages/server/src/database/tenant/migrations/20230405232607_drop_phone_number_from_users.ts
packages/server/src/database/tenant/migrations/20230810191606_create_tax_rates.ts
packages/server/src/database/tenant/migrations/20231004012644_add_tax_amount_withheld_to_bills_table.ts
packages/server/src/database/tenant/migrations/20231004020636_add_sell_purchase_tax_to_items_table.ts
packages/server/src/database/tenant/migrations/20231108170207_create_storage_table.ts
packages/server/src/database/tenant/migrations/20231202124014_change_item_entries_rate_to_float.ts
packages/server/src/database/tenant/migrations/20240201160214_create_plaid_items_Table.ts
packages/server/src/database/tenant/migrations/20240201235818_add_plaid_account_id_to_accounts_table.ts
packages/server/src/database/tenant/migrations/20240204180554_add_plaid_transaction_id_to_cashflow_transaction.ts
packages/server/src/database/tenant/migrations/20240228183404_create_uncateogrized_cashflow_transactions_table.ts
packages/server/src/database/tenant/migrations/20240304153926_add_uncategorized_transactions_column_to_accounts_table.ts
packages/server/src/database/tenant/migrations/20240308122047_add_uncategorized_transaction_id_to_cashflow_transactions.ts
packages/server/src/database/tenant/migrations/20240604153938_drop_storage_table.ts
packages/server/src/database/tenant/migrations/20240604153951_create_documents_table.ts
packages/server/src/database/tenant/migrations/20240604154005_create_documents_links_table.ts
packages/server/src/database/tenant/migrations/20240618100137_create_bank_rules_table.ts
packages/server/src/database/tenant/migrations/20240618171553_create_recognized_bank_transactions_table.ts
packages/server/src/database/tenant/migrations/20240618175241_add_recognized_transaction_id_to_uncategorized_transactins_table.ts
packages/server/src/database/tenant/migrations/20240619133733_create_matched_bank_transactions_table.ts
packages/server/src/database/tenant/migrations/20240620111308_add_excluded_column_to_uncategorized_cashflow_transactions_table.ts
packages/server/src/database/tenant/migrations/20240623154149_add_batch_column_to_uncategorized_cashflow_transactions_table.ts
packages/server/src/database/tenant/migrations/20240704064858_change_settings_value_to_text.ts
packages/server/src/database/tenant/migrations/20240709122347_move_cashflow_transaction_type_to_transaction_type_column.ts
packages/server/src/database/tenant/migrations/20240716114732_add_plaid_item_id_to_accounts_table.ts
packages/server/src/database/tenant/migrations/20240729172403_add_is_syncing_owner_to_accounts_table.ts
packages/server/src/database/tenant/migrations/20240801130829_change_tax_amount_withheld_column_precision_in_bills_and_sales_invoices_tables.ts
packages/server/src/database/tenant/migrations/20240804084709_create_paused_at_column_to_plaid_items_table.ts
packages/server/src/database/tenant/migrations/20240811121028_add_pending_column_to_uncategorized_transactions_table.ts
packages/server/src/database/tenant/migrations/20240909101051_add_stripe_pintent_id_to_payments_received.ts
packages/server/src/database/tenant/migrations/20240911112147_create_pdf_templates_table.ts
packages/server/src/database/tenant/migrations/20240915155403_payment_integration.ts
packages/server/src/database/tenant/migrations/20240915163722_creat_transaction_payment_service_table.ts
packages/server/src/database/tenant/migrations/20240915195024_seed_standard_pdf_templates.ts
packages/server/src/database/tenant/migrations/20241113113437_change_quantity_in_items_entries_to_decimal.ts
packages/server/src/database/tenant/migrations/20241128080734_add_discount_to_invoices_table.ts
packages/server/src/database/tenant/migrations/20241128081259_add_discount_to_estimates_table.ts
packages/server/src/database/tenant/migrations/20241128084550_add_discount_to_receipts_table.ts
packages/server/src/database/tenant/migrations/20241128085243_add_discount_to_bills_table.ts
packages/server/src/database/tenant/migrations/20241128090222_add_discount_to_credit_notes_table.ts
packages/server/src/database/tenant/migrations/20241128160604_add_discount_to_vendor_credits_table.ts
packages/server/src/database/tenant/migrations/20241211103019_add_discount_type_to_items_entries_table.ts
packages/server/src/database/tenant/migrations/20250326120000_add_contact_code_to_contacts.ts
packages/server/src/database/tenant/migrations/20260316000000_fix_account_type_typos.ts
packages/server/src/database/tenant/seeds/core/20190423085242_seed_accounts.ts
packages/server/src/database/tenant/seeds/core/20200810121809_seed_settings.ts
packages/server/src/database/tenant/seeds/core/20200810121909_seed_items_settings.ts
packages/server/src/database/tenant/seeds/core/20210810121909_seed_roles.ts
packages/server/src/database/tenant/seeds/core/20210812121909_seed_roles_permissions.ts
packages/server/src/database/tenant/seeds/core/20210912121909_seed_credit_settings.ts
packages/server/src/database/tenant/seeds/core/20230912121909_seed_tax_rates.ts
packages/server/src/database/tenant/seeds/core/20230912121909_update_tax_payable_account.ts
packages/server/src/database/tenant/seeds/core/index.ts
packages/server/src/database/tenant/seeds/data/accounts.ts
packages/server/src/database/tenant/seeds/data/TaxRates.ts
packages/server/src/interceptors/ExcludeNull.interceptor.ts
packages/server/src/interceptors/global-prefix.interceptor.ts
packages/server/src/interceptors/user-ip.interceptor.ts
packages/server/src/interfaces/Account.ts
packages/server/src/interfaces/Item.ts
packages/server/src/interfaces/Model.ts
packages/server/src/interfaces/SubscriptionPlan.ts
packages/server/src/interfaces/Tenant.ts
packages/server/src/libs/accounts-utils/AccountTypesUtils.ts
packages/server/src/libs/chromiumly/_types.ts
packages/server/src/libs/chromiumly/Chromiumly.ts
packages/server/src/libs/chromiumly/Converter.ts
packages/server/src/libs/chromiumly/ConvertUtils.ts
packages/server/src/libs/chromiumly/GotenbergUtils.ts
packages/server/src/libs/chromiumly/HTMLConvert.ts
packages/server/src/libs/chromiumly/UrlConvert.ts
packages/server/src/libs/dependency-graph/index.ts
packages/server/src/libs/logic-evaluation/Lexer.ts
packages/server/src/libs/logic-evaluation/Parser.ts
packages/server/src/libs/logic-evaluation/QueryParser.ts
packages/server/src/libs/migration-seed/constants.ts
packages/server/src/libs/migration-seed/FsMigrations.ts
packages/server/src/libs/migration-seed/interfaces.ts
packages/server/src/libs/migration-seed/MigrateUtils.ts
packages/server/src/libs/migration-seed/Seeder.ts
packages/server/src/libs/migration-seed/SeederConfig.ts
packages/server/src/libs/migration-seed/SeedMigration.ts
packages/server/src/libs/migration-seed/TableUtils.ts
packages/server/src/libs/migration-seed/TenantSeeder.ts
packages/server/src/libs/migration-seed/Utils.ts
packages/server/src/main.ts
packages/server/src/middleware/bull-board-auth.middleware.ts
packages/server/src/middleware/logger.middleware.ts
packages/server/src/models/Model.ts
packages/server/src/models/withDateSessionMixin.ts
packages/server/src/modules/Accounts/Account.transformer.ts
packages/server/src/modules/Accounts/Accounts.constants.ts
packages/server/src/modules/Accounts/Accounts.controller.ts
packages/server/src/modules/Accounts/Accounts.module.ts
packages/server/src/modules/Accounts/Accounts.types.ts
packages/server/src/modules/Accounts/AccountsApplication.service.ts
packages/server/src/modules/Accounts/AccountsExportable.service.ts
packages/server/src/modules/Accounts/AccountsImportable.SampleData.ts
packages/server/src/modules/Accounts/AccountsImportable.service.ts
packages/server/src/modules/Accounts/AccountsSettings.service.ts
packages/server/src/modules/Accounts/AccountTransaction.transformer.ts
packages/server/src/modules/Accounts/ActivateAccount.service.ts
packages/server/src/modules/Accounts/BulkDeleteAccounts.service.ts
packages/server/src/modules/Accounts/CommandAccountValidators.service.ts
packages/server/src/modules/Accounts/constants.ts
packages/server/src/modules/Accounts/CreateAccount.dto.ts
packages/server/src/modules/Accounts/CreateAccount.service.ts
packages/server/src/modules/Accounts/DeleteAccount.service.ts
packages/server/src/modules/Accounts/dtos/AccountResponse.dto.ts
packages/server/src/modules/Accounts/dtos/AccountTypeResponse.dto.ts
packages/server/src/modules/Accounts/dtos/GetAccountsQuery.dto.ts
packages/server/src/modules/Accounts/dtos/GetAccountTransactionResponse.dto.ts
packages/server/src/modules/Accounts/dtos/GetAccountTransactionsQuery.dto.ts
packages/server/src/modules/Accounts/EditAccount.dto.ts
packages/server/src/modules/Accounts/EditAccount.service.ts
packages/server/src/modules/Accounts/GetAccount.service.ts
packages/server/src/modules/Accounts/GetAccounts.service.ts
packages/server/src/modules/Accounts/GetAccountTransactions.service.ts
packages/server/src/modules/Accounts/GetAccountTypes.service.ts
packages/server/src/modules/Accounts/models/Account.meta.ts
packages/server/src/modules/Accounts/models/Account.model.ts
packages/server/src/modules/Accounts/models/AccountTransaction.model.ts
packages/server/src/modules/Accounts/MutateBaseCurrencyAccounts.ts
packages/server/src/modules/Accounts/repositories/Account.repository.ts
packages/server/src/modules/Accounts/susbcribers/MutateBaseCurrencyAccounts.subscriber.ts
packages/server/src/modules/Accounts/utils/AccountType.utils.ts
packages/server/src/modules/Accounts/ValidateBulkDeleteAccounts.service.ts
packages/server/src/modules/App/App.controller.spec.ts
packages/server/src/modules/App/App.controller.ts
packages/server/src/modules/App/App.module.ts
packages/server/src/modules/App/App.service.ts
packages/server/src/modules/App/AppThrottle.module.ts
packages/server/src/modules/Attachments/_utils.ts
packages/server/src/modules/Attachments/Attachment.module.ts
packages/server/src/modules/Attachments/Attachment.transformer.ts
packages/server/src/modules/Attachments/Attachments.controller.ts
packages/server/src/modules/Attachments/Attachments.types.ts
packages/server/src/modules/Attachments/AttachmentsApplication.ts
packages/server/src/modules/Attachments/AttachmentTransformer.ts
packages/server/src/modules/Attachments/constants.ts
packages/server/src/modules/Attachments/decorators/InjectAttachable.decorator.ts
packages/server/src/modules/Attachments/DeleteAttachment.ts
packages/server/src/modules/Attachments/dtos/Attachment.dto.ts
packages/server/src/modules/Attachments/events/AttachmentsOnBills.ts
packages/server/src/modules/Attachments/events/AttachmentsOnCreditNote.ts
packages/server/src/modules/Attachments/events/AttachmentsOnExpenses.ts
packages/server/src/modules/Attachments/events/AttachmentsOnManualJournals.ts
packages/server/src/modules/Attachments/events/AttachmentsOnPaymentsMade.ts
packages/server/src/modules/Attachments/events/AttachmentsOnPaymentsReceived.ts
packages/server/src/modules/Attachments/events/AttachmentsOnSaleEstimates.ts
packages/server/src/modules/Attachments/events/AttachmentsOnSaleInvoice.ts
packages/server/src/modules/Attachments/events/AttachmentsOnSaleReceipts.ts
packages/server/src/modules/Attachments/events/AttachmentsOnVendorCredits.ts
packages/server/src/modules/Attachments/GetAttachment.ts
packages/server/src/modules/Attachments/GetAttachmentPresignedUrl.ts
packages/server/src/modules/Attachments/LinkAttachment.ts
packages/server/src/modules/Attachments/models/Document.model.ts
packages/server/src/modules/Attachments/models/DocumentLink.model.ts
packages/server/src/modules/Attachments/S3UploadPipeline.ts
packages/server/src/modules/Attachments/UnlinkAttachment.ts
packages/server/src/modules/Attachments/UploadDocument.ts
packages/server/src/modules/Attachments/ValidateAttachments.ts
packages/server/src/modules/Auth/api-key/AuthApiKey.guard.ts
packages/server/src/modules/Auth/api-key/AuthApiKey.strategy.ts
packages/server/src/modules/Auth/api-key/MixedAuth.guard.ts
packages/server/src/modules/Auth/Auth.constants.ts
packages/server/src/modules/Auth/Auth.controller.ts
packages/server/src/modules/Auth/Auth.interfaces.ts
packages/server/src/modules/Auth/Auth.module.ts
packages/server/src/modules/Auth/Auth.utils.ts
packages/server/src/modules/Auth/AuthApiKeys.controllers.ts
packages/server/src/modules/Auth/AuthApplication.sevice.ts
packages/server/src/modules/Auth/Authed.controller.ts
packages/server/src/modules/Auth/AuthMailMessages.esrvice.ts
packages/server/src/modules/Auth/commands/AuthApiKeyAuthorization.service.ts
packages/server/src/modules/Auth/commands/AuthResetPassword.service.ts
packages/server/src/modules/Auth/commands/AuthSendResetPassword.service.ts
packages/server/src/modules/Auth/commands/AuthSignin.service.ts
packages/server/src/modules/Auth/commands/AuthSignup.service.ts
packages/server/src/modules/Auth/commands/AuthSignupConfirm.service.ts
packages/server/src/modules/Auth/commands/AuthSignupConfirmResend.service.ts
packages/server/src/modules/Auth/commands/GenerateApiKey.service.ts
packages/server/src/modules/Auth/dtos/ApiKey.dto.ts
packages/server/src/modules/Auth/dtos/AuthMetaResponse.dto.ts
packages/server/src/modules/Auth/dtos/AuthResetPassword.dto.ts
packages/server/src/modules/Auth/dtos/AuthSendResetPassword.dto.ts
packages/server/src/modules/Auth/dtos/AuthSignin.dto.ts
packages/server/src/modules/Auth/dtos/AuthSigninResponse.dto.ts
packages/server/src/modules/Auth/dtos/AuthSignup.dto.ts
packages/server/src/modules/Auth/dtos/AuthSignupVerify.dto.ts
packages/server/src/modules/Auth/exceptions/InvalidEmailPassword.exception.ts
packages/server/src/modules/Auth/exceptions/UserNotFound.exception.ts
packages/server/src/modules/Auth/guards/EnsureUserVerified.guard.ts
packages/server/src/modules/Auth/guards/jwt.guard.ts
packages/server/src/modules/Auth/guards/Local.guard.ts
packages/server/src/modules/Auth/models/ApiKey.model.ts
packages/server/src/modules/Auth/models/PasswordReset.ts
packages/server/src/modules/Auth/processors/SendResetPasswordMail.processor.ts
packages/server/src/modules/Auth/processors/SendSignupVerificationMail.processor.ts
packages/server/src/modules/Auth/queries/GetApiKeys.service.ts
packages/server/src/modules/Auth/queries/GetApiKeys.transformer.ts
packages/server/src/modules/Auth/queries/GetAuthedAccount.service.ts
packages/server/src/modules/Auth/queries/GetAuthedAccount.transformer.ts
packages/server/src/modules/Auth/queries/GetAuthMeta.service.ts
packages/server/src/modules/Auth/strategies/Jwt.strategy.ts
packages/server/src/modules/Auth/strategies/Local.strategy.ts
packages/server/src/modules/Auth/subscribers/AuthMail.subscriber.ts
packages/server/src/modules/AutoIncrementOrders/AutoIncrementOrders.module.ts
packages/server/src/modules/AutoIncrementOrders/AutoIncrementOrders.service.ts
packages/server/src/modules/BankingAccounts/BankAccounts.controller.ts
packages/server/src/modules/BankingAccounts/BankAccounts.module.ts
packages/server/src/modules/BankingAccounts/BankAccountsApplication.service.ts
packages/server/src/modules/BankingAccounts/commands/DisconnectBankAccount.service.ts
packages/server/src/modules/BankingAccounts/commands/PauseBankAccountFeeds.service.ts
packages/server/src/modules/BankingAccounts/commands/RefreshBankAccount.service.ts
packages/server/src/modules/BankingAccounts/commands/ResumeBankAccountFeeds.service.ts
packages/server/src/modules/BankingAccounts/dtos/BankAccountResponse.dto.ts
packages/server/src/modules/BankingAccounts/dtos/BankAccountsQuery.dto.ts
packages/server/src/modules/BankingAccounts/queries/GetBankAccounts.ts
packages/server/src/modules/BankingAccounts/queries/GetBankAccountSummary.ts
packages/server/src/modules/BankingAccounts/subscribers/DeleteUncategorizedTransactionsOnAccountDeleting.ts
packages/server/src/modules/BankingAccounts/subscribers/DisconnectPlaidItemOnAccountDeleted.ts
packages/server/src/modules/BankingAccounts/types/BankAccounts.types.ts
packages/server/src/modules/BankingCategorize/BankingCategorize.application.ts
packages/server/src/modules/BankingCategorize/BankingCategorize.controller.ts
packages/server/src/modules/BankingCategorize/BankingCategorize.module.ts
packages/server/src/modules/BankingCategorize/commands/CategorizeBankTransaction.ts
packages/server/src/modules/BankingCategorize/commands/CategorizeTransactionAsExpense.ts
packages/server/src/modules/BankingCategorize/commands/CreateUncategorizedTransaction.service.ts
packages/server/src/modules/BankingCategorize/commands/UncategorizeBankTransaction.service.ts
packages/server/src/modules/BankingCategorize/commands/UncategorizeBankTransactionsBulk.service.ts
packages/server/src/modules/BankingCategorize/commands/UncategorizedTransaction.transformer.ts
packages/server/src/modules/BankingCategorize/commands/UncategorizedTransactionsImportable.ts
packages/server/src/modules/BankingCategorize/dtos/CategorizeBankTransaction.dto.ts
packages/server/src/modules/BankingCategorize/dtos/CreateUncategorizedBankTransaction.dto.ts
packages/server/src/modules/BankingCategorize/types/BankingCategorize.types.ts
packages/server/src/modules/BankingMatching/_utils.ts
packages/server/src/modules/BankingMatching/BankingMatching.controller.ts
packages/server/src/modules/BankingMatching/BankingMatching.module.ts
packages/server/src/modules/BankingMatching/BankingMatchingApplication.ts
packages/server/src/modules/BankingMatching/commands/MatchTransactions.ts
packages/server/src/modules/BankingMatching/commands/MatchTransactionsTypes.ts
packages/server/src/modules/BankingMatching/commands/MatchTransactionsTypesRegistry.ts
packages/server/src/modules/BankingMatching/commands/UnmatchMatchedTransaction.service.ts
packages/server/src/modules/BankingMatching/commands/ValidateTransactionsMatched.service.ts
packages/server/src/modules/BankingMatching/dtos/GetMatchedTransactionsQuery.dto.ts
packages/server/src/modules/BankingMatching/dtos/GetMatchedTransactionsResponse.dto.ts
packages/server/src/modules/BankingMatching/dtos/MatchBankTransaction.dto.ts
packages/server/src/modules/BankingMatching/events/DecrementUncategorizedTransactionsOnMatch.ts
packages/server/src/modules/BankingMatching/events/ValidateMatchingOnCashflowDelete.ts
packages/server/src/modules/BankingMatching/events/ValidateMatchingOnExpenseDelete.ts
packages/server/src/modules/BankingMatching/events/ValidateMatchingOnManualJournalDelete.ts
packages/server/src/modules/BankingMatching/events/ValidateMatchingOnPaymentMadeDelete.ts
packages/server/src/modules/BankingMatching/events/ValidateMatchingOnPaymentReceivedDelete.ts
packages/server/src/modules/BankingMatching/models/MatchedBankTransaction.ts
packages/server/src/modules/BankingMatching/queries/GetMatchedTransactionBillsTransformer.ts
packages/server/src/modules/BankingMatching/queries/GetMatchedTransactionCashflowTransformer.ts
packages/server/src/modules/BankingMatching/queries/GetMatchedTransactionExpensesTransformer.ts
packages/server/src/modules/BankingMatching/queries/GetMatchedTransactionInvoicesTransformer.ts
packages/server/src/modules/BankingMatching/queries/GetMatchedTransactionManualJournalsTransformer.ts
packages/server/src/modules/BankingMatching/queries/GetMatchedTransactions.service.ts
packages/server/src/modules/BankingMatching/queries/GetMatchedTransactionsByBills.service.ts
packages/server/src/modules/BankingMatching/queries/GetMatchedTransactionsByCashflow.ts
packages/server/src/modules/BankingMatching/queries/GetMatchedTransactionsByExpenses.ts
packages/server/src/modules/BankingMatching/queries/GetMatchedTransactionsByInvoices.service.ts
packages/server/src/modules/BankingMatching/queries/GetMatchedTransactionsByManualJournals.service.ts
packages/server/src/modules/BankingMatching/queries/GetMatchedTransactionsByType.ts
packages/server/src/modules/BankingMatching/types.ts
packages/server/src/modules/BankingPlaid/BankingPlaid.controller.ts
packages/server/src/modules/BankingPlaid/BankingPlaid.module.ts
packages/server/src/modules/BankingPlaid/BankingPlaidWebhooks.controller.ts
packages/server/src/modules/BankingPlaid/command/PlaidItem.ts
packages/server/src/modules/BankingPlaid/command/PlaidSyncDB.ts
packages/server/src/modules/BankingPlaid/command/PlaidUpdateTransactions.ts
packages/server/src/modules/BankingPlaid/command/PlaidWebhooks.ts
packages/server/src/modules/BankingPlaid/command/SetupPlaidItemTenant.service.ts
packages/server/src/modules/BankingPlaid/dtos/PlaidItem.dto.ts
packages/server/src/modules/BankingPlaid/jobs/PlaidFetchTransactionsJob.ts
packages/server/src/modules/BankingPlaid/models/PlaidItem.ts
packages/server/src/modules/BankingPlaid/models/SystemPlaidItem.ts
packages/server/src/modules/BankingPlaid/PlaidApplication.ts
packages/server/src/modules/BankingPlaid/queries/GetPlaidLinkToken.service.ts
packages/server/src/modules/BankingPlaid/subscribers/PlaidUpdateTransactionsOnItemCreatedSubscriber.ts
packages/server/src/modules/BankingPlaid/subscribers/RecognizeSyncedBankTransactions.subscriber.ts
packages/server/src/modules/BankingPlaid/types/BankingPlaid.types.ts
packages/server/src/modules/BankingPlaid/utils.ts
packages/server/src/modules/BankingTranasctionsRegonize/_types.ts
packages/server/src/modules/BankingTranasctionsRegonize/_utils.ts
packages/server/src/modules/BankingTranasctionsRegonize/BankingRecognizedTransactions.controller.ts
packages/server/src/modules/BankingTranasctionsRegonize/BankingTransactionsRegonize.module.ts
packages/server/src/modules/BankingTranasctionsRegonize/commands/RecognizeTranasctions.service.ts
packages/server/src/modules/BankingTranasctionsRegonize/commands/RevertRecognizedTransactions.service.ts
packages/server/src/modules/BankingTranasctionsRegonize/dtos/GetRecognizedTransactionResponse.dto.ts
packages/server/src/modules/BankingTranasctionsRegonize/events/TriggerRecognizedTransactions.ts
packages/server/src/modules/BankingTranasctionsRegonize/GetRecongizedTransactions.ts
packages/server/src/modules/BankingTranasctionsRegonize/jobs/RecognizeTransactionsJob.ts
packages/server/src/modules/BankingTranasctionsRegonize/jobs/RerecognizeTransactionsJob.ts
packages/server/src/modules/BankingTranasctionsRegonize/jobs/RevertRecognizedTransactionsJob.ts
packages/server/src/modules/BankingTranasctionsRegonize/models/RecognizedBankTransaction.ts
packages/server/src/modules/BankingTranasctionsRegonize/queries/GetRecognizedTransaction.service.ts
packages/server/src/modules/BankingTranasctionsRegonize/queries/GetRecognizedTransactionTransformer.ts
packages/server/src/modules/BankingTranasctionsRegonize/RecognizedTransactions.application.ts
packages/server/src/modules/BankingTransactions/BankingTransactions.module.ts
packages/server/src/modules/BankingTransactions/BankingTransactionsApplication.service.ts
packages/server/src/modules/BankingTransactions/commands/BankTransactionAutoIncrement.service.ts
packages/server/src/modules/BankingTransactions/commands/BankTransactionGL.ts
packages/server/src/modules/BankingTransactions/commands/BankTransactionGLEntries.ts
packages/server/src/modules/BankingTransactions/commands/CommandCasflowValidator.service.ts
packages/server/src/modules/BankingTransactions/commands/CreateBankTransaction.service.ts
packages/server/src/modules/BankingTransactions/commands/DeleteCashflowTransaction.service.ts
packages/server/src/modules/BankingTransactions/commands/RemovePendingUncategorizedTransaction.service.ts
packages/server/src/modules/BankingTransactions/commands/ValidateDeleteBankAccountTransactions.service.ts
packages/server/src/modules/BankingTransactions/constants.ts
packages/server/src/modules/BankingTransactions/controllers/BankingPendingTransactions.controller.ts
packages/server/src/modules/BankingTransactions/controllers/BankingTransactions.controller.ts
packages/server/src/modules/BankingTransactions/controllers/BankingUncategorizedTransactions.controller.ts
packages/server/src/modules/BankingTransactions/dtos/BankTransactionResponse.dto.ts
packages/server/src/modules/BankingTransactions/dtos/CreateBankTransaction.dto.ts
packages/server/src/modules/BankingTransactions/dtos/GetAutofillCategorizeTransactionResponse.dto.ts
packages/server/src/modules/BankingTransactions/dtos/GetBankTranasctionsQuery.dto.ts
packages/server/src/modules/BankingTransactions/dtos/GetPendingTransactionResponse.dto.ts
packages/server/src/modules/BankingTransactions/dtos/GetPendingTransactionsQuery.dto.ts
packages/server/src/modules/BankingTransactions/dtos/GetUncategorizedTransactionsQuery.dto.ts
packages/server/src/modules/BankingTransactions/dtos/NumberFormatQuery.dto.ts
packages/server/src/modules/BankingTransactions/models/BankAccount.ts
packages/server/src/modules/BankingTransactions/models/BankTransaction.ts
packages/server/src/modules/BankingTransactions/models/BankTransactionLine.ts
packages/server/src/modules/BankingTransactions/models/UncategorizedBankTransaction.meta.ts
packages/server/src/modules/BankingTransactions/models/UncategorizedBankTransaction.ts
packages/server/src/modules/BankingTransactions/queries/BankAccountTransformer.ts
packages/server/src/modules/BankingTransactions/queries/BankTransactionsTransformer.ts
packages/server/src/modules/BankingTransactions/queries/BankTransactionTransformer.ts
packages/server/src/modules/BankingTransactions/queries/GetAutofillCategorizeTransaction/GetAutofillCategorizeTransaction.service.ts
packages/server/src/modules/BankingTransactions/queries/GetAutofillCategorizeTransaction/GetAutofillCategorizeTransactionTransformer.ts
packages/server/src/modules/BankingTransactions/queries/GetBankAccounts.service.ts
packages/server/src/modules/BankingTransactions/queries/GetBankAccountTransactions/_constants.ts
packages/server/src/modules/BankingTransactions/queries/GetBankAccountTransactions/_utils.ts
packages/server/src/modules/BankingTransactions/queries/GetBankAccountTransactions/GetBankAccountTransactions.service.ts
packages/server/src/modules/BankingTransactions/queries/GetBankAccountTransactions/GetBankAccountTransactions.ts
packages/server/src/modules/BankingTransactions/queries/GetBankAccountTransactions/GetBankAccountTransactionsRepo.service.ts
packages/server/src/modules/BankingTransactions/queries/GetBankTransaction.service.ts
packages/server/src/modules/BankingTransactions/queries/GetPendingBankAccountTransaction.service.ts
packages/server/src/modules/BankingTransactions/queries/GetPendingBankAccountTransactionTransformer.ts
packages/server/src/modules/BankingTransactions/queries/GetUncategorizedBankTransaction.service.ts
packages/server/src/modules/BankingTransactions/queries/GetUncategorizedTransactions.ts
packages/server/src/modules/BankingTransactions/subscribers/CashflowTransactionSubscriber.ts
packages/server/src/modules/BankingTransactions/subscribers/CashflowWithAccountSubscriber.ts
packages/server/src/modules/BankingTransactions/subscribers/DecrementUncategorizedTransactionOnCategorize.ts
packages/server/src/modules/BankingTransactions/subscribers/DeleteCashflowTransactionOnUncategorize.ts
packages/server/src/modules/BankingTransactions/subscribers/PreventDeleteTransactionsOnDelete.ts
packages/server/src/modules/BankingTransactions/types/BankingTransactions.types.ts
packages/server/src/modules/BankingTransactions/utils.ts
packages/server/src/modules/BankingTransactionsExclude/BankingTransactionsExclude.controller.ts
packages/server/src/modules/BankingTransactionsExclude/BankingTransactionsExclude.module.ts
packages/server/src/modules/BankingTransactionsExclude/commands/ExcludeBankTransaction.service.ts
packages/server/src/modules/BankingTransactionsExclude/commands/ExcludeBankTransactions.service.ts
packages/server/src/modules/BankingTransactionsExclude/commands/UnexcludeBankTransaction.service.ts
packages/server/src/modules/BankingTransactionsExclude/commands/UnexcludeBankTransactions.service.ts
packages/server/src/modules/BankingTransactionsExclude/commands/utils.ts
packages/server/src/modules/BankingTransactionsExclude/dtos/ExcludeBankTransactionsBulk.dto.ts
packages/server/src/modules/BankingTransactionsExclude/dtos/GetExcludedBankTransactionResponse.dto.ts
packages/server/src/modules/BankingTransactionsExclude/dtos/GetExcludedBankTransactionsQuery.dto.ts
packages/server/src/modules/BankingTransactionsExclude/ExcludeBankTransactionsApplication.ts
packages/server/src/modules/BankingTransactionsExclude/queries/ExcludedBankTransaction.transformer.ts
packages/server/src/modules/BankingTransactionsExclude/queries/GetExcludedBankTransactions.ts
packages/server/src/modules/BankingTransactionsExclude/subscribers/DecrementUncategorizedTransactionOnExclude.ts
packages/server/src/modules/BankingTransactionsExclude/types/BankTransactionsExclude.types.ts
packages/server/src/modules/BankingTransactionsExclude/utils.ts
packages/server/src/modules/BankRules/BankRules.controller.ts
packages/server/src/modules/BankRules/BankRules.module.ts
packages/server/src/modules/BankRules/BankRulesApplication.ts
packages/server/src/modules/BankRules/commands/CreateBankRule.service.ts
packages/server/src/modules/BankRules/commands/DeleteBankRule.service.ts
packages/server/src/modules/BankRules/commands/DeleteBankRules.service.ts
packages/server/src/modules/BankRules/commands/EditBankRule.service.ts
packages/server/src/modules/BankRules/dtos/BankRule.dto.ts
packages/server/src/modules/BankRules/dtos/BankRuleResponse.dto.ts
packages/server/src/modules/BankRules/events/UnlinkBankRuleOnDeleteBankRule.ts
packages/server/src/modules/BankRules/models/BankRule.ts
packages/server/src/modules/BankRules/models/BankRuleCondition.ts
packages/server/src/modules/BankRules/queries/GetBankRule.service.ts
packages/server/src/modules/BankRules/queries/GetBankRules.service.ts
packages/server/src/modules/BankRules/queries/GetBankRulesTransformer.ts
packages/server/src/modules/BankRules/queries/GetBankRuleTransformer.ts
packages/server/src/modules/BankRules/types.ts
packages/server/src/modules/BillLandedCosts/BaseLandedCost.service.ts
packages/server/src/modules/BillLandedCosts/BillLandedCosts.module.ts
packages/server/src/modules/BillLandedCosts/commands/AllocateLandedCost.service.ts
packages/server/src/modules/BillLandedCosts/commands/BillAllocatedLandedCostTransactions.service.ts
packages/server/src/modules/BillLandedCosts/commands/BillLandedCost.service.ts
packages/server/src/modules/BillLandedCosts/commands/ExpenseLandedCost.service.ts
packages/server/src/modules/BillLandedCosts/commands/LandedCostGLEntries.service.ts
packages/server/src/modules/BillLandedCosts/commands/LandedCostGLEntries.subscriber.ts
packages/server/src/modules/BillLandedCosts/commands/LandedCostInventoryTransactions.service.ts
packages/server/src/modules/BillLandedCosts/commands/LandedCostInventoryTransactions.subscriber.ts
packages/server/src/modules/BillLandedCosts/commands/LandedCostSyncCostTransactions.service.ts
packages/server/src/modules/BillLandedCosts/commands/LandedCostSyncCostTransactions.subscriber.ts
packages/server/src/modules/BillLandedCosts/commands/LandedCostTransactions.service.ts
packages/server/src/modules/BillLandedCosts/commands/RevertAllocatedLandedCost.service.ts
packages/server/src/modules/BillLandedCosts/commands/TransctionLandedCost.service.ts
packages/server/src/modules/BillLandedCosts/dtos/AllocateBillLandedCost.dto.ts
packages/server/src/modules/BillLandedCosts/dtos/LandedCostTransactionsQuery.dto.ts
packages/server/src/modules/BillLandedCosts/LandedCost.controller.ts
packages/server/src/modules/BillLandedCosts/models/BillLandedCost.ts
packages/server/src/modules/BillLandedCosts/models/BillLandedCostEntry.ts
packages/server/src/modules/BillLandedCosts/TransactionLandedCostEntries.service.ts
packages/server/src/modules/BillLandedCosts/types/BillLandedCosts.types.ts
packages/server/src/modules/BillLandedCosts/utils.ts
packages/server/src/modules/BillPayments/BillPayments.controller.ts
packages/server/src/modules/BillPayments/BillPayments.module.ts
packages/server/src/modules/BillPayments/BillPaymentsApplication.service.ts
packages/server/src/modules/BillPayments/commands/BillPaymentBillSync.service.ts
packages/server/src/modules/BillPayments/commands/BillPaymentGL.ts
packages/server/src/modules/BillPayments/commands/BillPaymentGLEntries.ts
packages/server/src/modules/BillPayments/commands/BillPaymentsImportable.ts
packages/server/src/modules/BillPayments/commands/BillPaymentsPages.service.ts
packages/server/src/modules/BillPayments/commands/BillPaymentValidators.service.ts
packages/server/src/modules/BillPayments/commands/CommandBillPaymentDTOTransformer.service.ts
packages/server/src/modules/BillPayments/commands/CreateBillPayment.service.ts
packages/server/src/modules/BillPayments/commands/DeleteBillPayment.service.ts
packages/server/src/modules/BillPayments/commands/EditBillPayment.service.ts
packages/server/src/modules/BillPayments/constants.ts
packages/server/src/modules/BillPayments/dtos/BillPayment.dto.ts
packages/server/src/modules/BillPayments/dtos/BillPaymentResponse.dto.ts
packages/server/src/modules/BillPayments/dtos/GetBillPaymentsFilter.dto.ts
packages/server/src/modules/BillPayments/models/BillPayment.meta.ts
packages/server/src/modules/BillPayments/models/BillPayment.ts
packages/server/src/modules/BillPayments/models/BillPaymentEntry.ts
packages/server/src/modules/BillPayments/queries/BillPaymentEntry.transformer.ts
packages/server/src/modules/BillPayments/queries/BillPaymentsExportable.ts
packages/server/src/modules/BillPayments/queries/BillPaymentTransactionTransformer.ts
packages/server/src/modules/BillPayments/queries/BillPaymentTransformer.ts
packages/server/src/modules/BillPayments/queries/GetBillPayment.service.ts
packages/server/src/modules/BillPayments/queries/GetBillPayments.service.ts
packages/server/src/modules/BillPayments/queries/GetPaymentBills.service.ts
packages/server/src/modules/BillPayments/subscribers/BillPaymentBillSyncSubscriber.ts
packages/server/src/modules/BillPayments/subscribers/BillPaymentGLEntriesSubscriber.ts
packages/server/src/modules/BillPayments/types/BillPayments.types.ts
packages/server/src/modules/Bills/Bills.application.ts
packages/server/src/modules/Bills/Bills.constants.ts
packages/server/src/modules/Bills/Bills.controller.ts
packages/server/src/modules/Bills/Bills.module.ts
packages/server/src/modules/Bills/Bills.types.ts
packages/server/src/modules/Bills/BulkDeleteBills.service.ts
packages/server/src/modules/Bills/commands/BillDTOTransformer.service.ts
packages/server/src/modules/Bills/commands/BillInventoryTransactions.ts
packages/server/src/modules/Bills/commands/BillPaymentsGLEntriesRewrite.ts
packages/server/src/modules/Bills/commands/BillPaymentsGLEntriesRewriteSubscriber.ts
packages/server/src/modules/Bills/commands/BillsExportable.ts
packages/server/src/modules/Bills/commands/BillsGL.ts
packages/server/src/modules/Bills/commands/BillsGLEntries.ts
packages/server/src/modules/Bills/commands/BillsImportable.ts
packages/server/src/modules/Bills/commands/BillsValidators.service.ts
packages/server/src/modules/Bills/commands/CreateBill.service.ts
packages/server/src/modules/Bills/commands/DeleteBill.service.ts
packages/server/src/modules/Bills/commands/EditBill.service.ts
packages/server/src/modules/Bills/commands/OpenBill.service.ts
packages/server/src/modules/Bills/dtos/Bill.dto.ts
packages/server/src/modules/Bills/dtos/BillResponse.dto.ts
packages/server/src/modules/Bills/dtos/GetBillsQuery.dto.ts
packages/server/src/modules/Bills/models/Bill.meta.ts
packages/server/src/modules/Bills/models/Bill.ts
packages/server/src/modules/Bills/queries/Bill.transformer.ts
packages/server/src/modules/Bills/queries/GetBill.ts
packages/server/src/modules/Bills/queries/GetBillPayments.ts
packages/server/src/modules/Bills/queries/GetBills.service.ts
packages/server/src/modules/Bills/queries/GetDueBills.service.ts
packages/server/src/modules/Bills/subscribers/BillGLEntriesSubscriber.ts
packages/server/src/modules/Bills/subscribers/BillWriteInventoryTransactionsSubscriber.ts
packages/server/src/modules/Bills/ValidateBulkDeleteBills.service.ts
packages/server/src/modules/Branches/Branches.controller.ts
packages/server/src/modules/Branches/Branches.module.ts
packages/server/src/modules/Branches/Branches.types.ts
packages/server/src/modules/Branches/BranchesApplication.service.ts
packages/server/src/modules/Branches/BranchesSettings.ts
packages/server/src/modules/Branches/BranchIntegrationErrorsMiddleware.ts
packages/server/src/modules/Branches/commands/ActivateBranchesFeature.service.ts
packages/server/src/modules/Branches/commands/BranchCommandValidator.service.ts
packages/server/src/modules/Branches/commands/CreateBranch.service.ts
packages/server/src/modules/Branches/commands/DeleteBranch.service.ts
packages/server/src/modules/Branches/commands/EditBranch.service.ts
packages/server/src/modules/Branches/commands/MarkBranchAsPrimary.service.ts
packages/server/src/modules/Branches/constants.ts
packages/server/src/modules/Branches/CRUDBranch.ts
packages/server/src/modules/Branches/dtos/Branch.dto.ts
packages/server/src/modules/Branches/dtos/BranchResponse.dto.ts
packages/server/src/modules/Branches/EventsProvider.ts
packages/server/src/modules/Branches/integrations/BranchTransactionDTOTransform.ts
packages/server/src/modules/Branches/integrations/Cashflow/CashflowActivateBranches.ts
packages/server/src/modules/Branches/integrations/constants.ts
packages/server/src/modules/Branches/integrations/Expense/ExpensesActivateBranches.ts
packages/server/src/modules/Branches/integrations/ManualJournals/constants.ts
packages/server/src/modules/Branches/integrations/ManualJournals/ManualJournalBranchesActivate.ts
packages/server/src/modules/Branches/integrations/ManualJournals/ManualJournalDTOTransformer.service.ts
packages/server/src/modules/Branches/integrations/ManualJournals/ManualJournalsBranchesValidator.ts
packages/server/src/modules/Branches/integrations/Purchases/BillBranchesActivate.ts
packages/server/src/modules/Branches/integrations/Purchases/PaymentMadeBranchesActivate.ts
packages/server/src/modules/Branches/integrations/Purchases/VendorCreditBranchesActivate.ts
packages/server/src/modules/Branches/integrations/Sales/CreditNoteBranchesActivate.ts
packages/server/src/modules/Branches/integrations/Sales/PaymentReceiveBranchesActivate.ts
packages/server/src/modules/Branches/integrations/Sales/SaleEstimatesBranchesActivate.ts
packages/server/src/modules/Branches/integrations/Sales/SaleInvoiceBranchesActivate.ts
packages/server/src/modules/Branches/integrations/Sales/SaleReceiptBranchesActivate.ts
packages/server/src/modules/Branches/integrations/ValidateBranchExistance.ts
packages/server/src/modules/Branches/models/Branch.meta.ts
packages/server/src/modules/Branches/models/Branch.model.ts
packages/server/src/modules/Branches/queries/GetBranch.service.ts
packages/server/src/modules/Branches/queries/GetBranches.service.ts
packages/server/src/modules/Branches/subscribers/Activate/BillBranchesActivateSubscriber.ts
packages/server/src/modules/Branches/subscribers/Activate/CashflowBranchesActivateSubscriber.ts
packages/server/src/modules/Branches/subscribers/Activate/CreditNoteBranchesActivateSubscriber.ts
packages/server/src/modules/Branches/subscribers/Activate/ExpenseBranchesActivateSubscriber.ts
packages/server/src/modules/Branches/subscribers/Activate/PaymentMadeBranchesActivateSubscriber.ts
packages/server/src/modules/Branches/subscribers/Activate/PaymentReceiveBranchesActivateSubscriber.ts
packages/server/src/modules/Branches/subscribers/Activate/SaleEstiamtesBranchesActivateSubscriber.ts
packages/server/src/modules/Branches/subscribers/Activate/SaleInvoiceBranchesActivateSubscriber.ts
packages/server/src/modules/Branches/subscribers/Activate/SaleReceiptsBranchesActivateSubscriber.ts
packages/server/src/modules/Branches/subscribers/Activate/VendorCreditBranchesActivateSubscriber.ts
packages/server/src/modules/Branches/subscribers/Validators/BillBranchSubscriber.ts
packages/server/src/modules/Branches/subscribers/Validators/CashflowBranchDTOValidatorSubscriber.ts
packages/server/src/modules/Branches/subscribers/Validators/ContactOpeningBalanceBranchSubscriber.ts
packages/server/src/modules/Branches/subscribers/Validators/CreditNoteBranchesSubscriber.ts
packages/server/src/modules/Branches/subscribers/Validators/CreditNoteRefundBranchSubscriber.ts
packages/server/src/modules/Branches/subscribers/Validators/ExpenseBranchSubscriber.ts
packages/server/src/modules/Branches/subscribers/Validators/InventoryAdjustmentBranchValidatorSubscriber.ts
packages/server/src/modules/Branches/subscribers/Validators/InvoiceBranchValidatorSubscriber.ts
packages/server/src/modules/Branches/subscribers/Validators/ManualJournalBranchSubscriber.ts
packages/server/src/modules/Branches/subscribers/Validators/PaymentMadeBranchSubscriber.ts
packages/server/src/modules/Branches/subscribers/Validators/PaymentReceiveBranchSubscriber.ts
packages/server/src/modules/Branches/subscribers/Validators/SaleEstimateMultiBranchesSubscriber.ts
packages/server/src/modules/Branches/subscribers/Validators/SaleReceiptBranchesSubscriber.ts
packages/server/src/modules/Branches/subscribers/Validators/VendorCreditBranchSubscriber.ts
packages/server/src/modules/Branches/subscribers/Validators/VendorCreditRefundBranchSubscriber.ts
packages/server/src/modules/ChromiumlyTenancy/ChromiumlyHtmlConvert.service.ts
packages/server/src/modules/ChromiumlyTenancy/ChromiumlyTenancy.module.ts
packages/server/src/modules/ChromiumlyTenancy/ChromiumlyTenancy.service.ts
packages/server/src/modules/ChromiumlyTenancy/models/Document.ts
packages/server/src/modules/ChromiumlyTenancy/models/DocumentLink.ts
packages/server/src/modules/ChromiumlyTenancy/utils.ts
packages/server/src/modules/CLI/CLI.module.ts
packages/server/src/modules/CLI/commands/BaseCommand.ts
packages/server/src/modules/CLI/commands/OpenApiExport.command.ts
packages/server/src/modules/CLI/commands/SystemMigrateLatest.command.ts
packages/server/src/modules/CLI/commands/SystemMigrateMake.command.ts
packages/server/src/modules/CLI/commands/SystemMigrateRollback.command.ts
packages/server/src/modules/CLI/commands/SystemSeedLatest.command.ts
packages/server/src/modules/CLI/commands/TenantsList.command.ts
packages/server/src/modules/CLI/commands/TenantsMigrateLatest.command.ts
packages/server/src/modules/CLI/commands/TenantsMigrateMake.command.ts
packages/server/src/modules/CLI/commands/TenantsMigrateRollback.command.ts
packages/server/src/modules/CLI/commands/TenantsSeedLatest.command.ts
packages/server/src/modules/Contacts/commands/ActivateContact.service.ts
packages/server/src/modules/Contacts/commands/InactivateContact.service.ts
packages/server/src/modules/Contacts/Contact.transformer.ts
packages/server/src/modules/Contacts/Contacts.constants.ts
packages/server/src/modules/Contacts/Contacts.controller.ts
packages/server/src/modules/Contacts/Contacts.module.ts
packages/server/src/modules/Contacts/Contacts.types.ts
packages/server/src/modules/Contacts/dtos/GetContactsAutoCompleteQuery.dto.ts
packages/server/src/modules/Contacts/models/Contact.ts
packages/server/src/modules/Contacts/queries/GetAutoCompleteContacts.service.ts
packages/server/src/modules/Contacts/queries/GetContact.service.ts
packages/server/src/modules/Contacts/types/Contacts.types.ts
packages/server/src/modules/CreditNoteRefunds/commands/CreateRefundCreditNote.service.ts
packages/server/src/modules/CreditNoteRefunds/commands/DeleteRefundCreditNote.service.ts
packages/server/src/modules/CreditNoteRefunds/commands/RefundCreditNote.service.ts
packages/server/src/modules/CreditNoteRefunds/commands/RefundCreditNoteGLEntries.ts
packages/server/src/modules/CreditNoteRefunds/commands/RefundSyncCreditNoteBalance.ts
packages/server/src/modules/CreditNoteRefunds/CreditNoteRefunds.controller.ts
packages/server/src/modules/CreditNoteRefunds/CreditNoteRefunds.module.ts
packages/server/src/modules/CreditNoteRefunds/CreditNotesRefundsApplication.service.ts
packages/server/src/modules/CreditNoteRefunds/dto/CreditNoteRefund.dto.ts
packages/server/src/modules/CreditNoteRefunds/dto/RefundCreditNoteResponse.dto.ts
packages/server/src/modules/CreditNoteRefunds/models/RefundCreditNote.ts
packages/server/src/modules/CreditNoteRefunds/queries/GetCreditNoteRefunds.service.ts
packages/server/src/modules/CreditNoteRefunds/queries/GetRefundCreditNoteTransaction.service.ts
packages/server/src/modules/CreditNoteRefunds/types/CreditNoteRefunds.types.ts
packages/server/src/modules/CreditNotes/BulkDeleteCreditNotes.service.ts
packages/server/src/modules/CreditNotes/commands/CommandCreditNoteDTOTransform.service.ts
packages/server/src/modules/CreditNotes/commands/CreateCreditNote.service.ts
packages/server/src/modules/CreditNotes/commands/CreditNoteAutoIncrement.service.ts
packages/server/src/modules/CreditNotes/commands/CreditNoteGL.ts
packages/server/src/modules/CreditNotes/commands/CreditNoteGLEntries.ts
packages/server/src/modules/CreditNotes/commands/CreditNotesExportable.ts
packages/server/src/modules/CreditNotes/commands/CreditNotesImportable.ts
packages/server/src/modules/CreditNotes/commands/CreditNotesInventoryTransactions.ts
packages/server/src/modules/CreditNotes/commands/DeleteCreditNote.service.ts
packages/server/src/modules/CreditNotes/commands/EditCreditNote.service.ts
packages/server/src/modules/CreditNotes/commands/OpenCreditNote.service.ts
packages/server/src/modules/CreditNotes/constants.ts
packages/server/src/modules/CreditNotes/CreditNoteApplication.service.ts
packages/server/src/modules/CreditNotes/CreditNotes.controller.ts
packages/server/src/modules/CreditNotes/CreditNotes.module.ts
packages/server/src/modules/CreditNotes/dtos/CreditNote.dto.ts
packages/server/src/modules/CreditNotes/dtos/CreditNoteResponse.dto.ts
packages/server/src/modules/CreditNotes/dtos/CreditNoteStateResponse.dto.ts
packages/server/src/modules/CreditNotes/dtos/GetCreditNotesQuery.dto.ts
packages/server/src/modules/CreditNotes/dtos/RefundCreditNote.dto.ts
packages/server/src/modules/CreditNotes/models/CreditNote.meta.ts
packages/server/src/modules/CreditNotes/models/CreditNote.ts
packages/server/src/modules/CreditNotes/queries/CreditNoteBrandingTemplate.service.ts
packages/server/src/modules/CreditNotes/queries/CreditNoteTransformer.ts
packages/server/src/modules/CreditNotes/queries/GetCreditNote.service.ts
packages/server/src/modules/CreditNotes/queries/GetCreditNotePdf.serivce.ts
packages/server/src/modules/CreditNotes/queries/GetCreditNotes.service.ts
packages/server/src/modules/CreditNotes/queries/GetCreditNoteState.service.ts
packages/server/src/modules/CreditNotes/queries/RefundCreditNoteTransformer.ts
packages/server/src/modules/CreditNotes/subscribers/CreditNoteAutoSerialSubscriber.ts
packages/server/src/modules/CreditNotes/subscribers/CreditNoteGLEntriesSubscriber.ts
packages/server/src/modules/CreditNotes/subscribers/CreditNoteInventoryTransactionsSubscriber.ts
packages/server/src/modules/CreditNotes/subscribers/DeleteCustomerLinkedCreditSubscriber.ts
packages/server/src/modules/CreditNotes/subscribers/RefundCreditNoteGLEntriesSubscriber.ts
packages/server/src/modules/CreditNotes/subscribers/RefundSyncCreditNoteBalanceSubscriber.ts
packages/server/src/modules/CreditNotes/types/CreditNotes.types.ts
packages/server/src/modules/CreditNotes/utils.ts
packages/server/src/modules/CreditNotes/ValidateBulkDeleteCreditNotes.service.ts
packages/server/src/modules/CreditNotesApplyInvoice/commands/CreditNoteApplySyncCredit.service.ts
packages/server/src/modules/CreditNotesApplyInvoice/commands/CreditNoteApplySyncInvoices.service.ts
packages/server/src/modules/CreditNotesApplyInvoice/commands/CreditNoteApplyToInvoices.service.ts
packages/server/src/modules/CreditNotesApplyInvoice/commands/DeleteCreditNoteApplyToInvoices.service.ts
packages/server/src/modules/CreditNotesApplyInvoice/commands/DeleteCustomerLinkedCreditNote.service.ts
packages/server/src/modules/CreditNotesApplyInvoice/CreditNotesApplyInvoice.controller.ts
packages/server/src/modules/CreditNotesApplyInvoice/CreditNotesApplyInvoice.module.ts
packages/server/src/modules/CreditNotesApplyInvoice/dtos/AppliedCreditNoteInvoiceResponse.dto.ts
packages/server/src/modules/CreditNotesApplyInvoice/dtos/ApplyCreditNoteToInvoices.dto.ts
packages/server/src/modules/CreditNotesApplyInvoice/dtos/CreditNoteInvoiceToApplyResponse.dto.ts
packages/server/src/modules/CreditNotesApplyInvoice/models/CreditNoteAppliedInvoice.ts
packages/server/src/modules/CreditNotesApplyInvoice/queries/CreditNoteAppliedInvoiceTransformer.ts
packages/server/src/modules/CreditNotesApplyInvoice/queries/CreditNoteWithInvoicesToApplyTransformer.ts
packages/server/src/modules/CreditNotesApplyInvoice/queries/GetCreditNoteAssociatedAppliedInvoices.service.ts
packages/server/src/modules/CreditNotesApplyInvoice/queries/GetCreditNoteAssociatedInvoicesToApply.service.ts
packages/server/src/modules/CreditNotesApplyInvoice/subscribers/CreditNoteApplySyncCreditSubscriber.ts
packages/server/src/modules/CreditNotesApplyInvoice/subscribers/CreditNoteApplySyncInvoicesSubscriber.ts
packages/server/src/modules/CreditNotesApplyInvoice/types/CreditNoteApplyInvoice.types.ts
packages/server/src/modules/Currencies/commands/CreateCurrency.service.ts
packages/server/src/modules/Currencies/commands/DeleteCurrency.service.ts
packages/server/src/modules/Currencies/commands/EditCurrency.service.ts
packages/server/src/modules/Currencies/commands/InitialCurrenciesSeed.service.ts
packages/server/src/modules/Currencies/Currencies.constants.ts
packages/server/src/modules/Currencies/Currencies.controller.ts
packages/server/src/modules/Currencies/Currencies.module.ts
packages/server/src/modules/Currencies/CurrenciesApplication.service.ts
packages/server/src/modules/Currencies/Currency.transformer.ts
packages/server/src/modules/Currencies/dtos/CreateCurrency.dto.ts
packages/server/src/modules/Currencies/dtos/CurrencyResponse.dto.ts
packages/server/src/modules/Currencies/dtos/EditCurrency.dto.ts
packages/server/src/modules/Currencies/models/Currency.model.ts
packages/server/src/modules/Currencies/queries/GetCurrencies.service.ts
packages/server/src/modules/Currencies/queries/GetCurrency.service.ts
packages/server/src/modules/Currencies/subscribers/SeedInitialCurrenciesOnSetup.subscriber.ts
packages/server/src/modules/Customers/_SampleData.ts
packages/server/src/modules/Customers/BulkDeleteCustomers.service.ts
packages/server/src/modules/Customers/commands/ActivateCustomer.service.ts
packages/server/src/modules/Customers/commands/CreateCustomer.service.ts
packages/server/src/modules/Customers/commands/CreateEditCustomerDTO.service.ts
packages/server/src/modules/Customers/commands/CustomerValidators.service.ts
packages/server/src/modules/Customers/commands/DeleteCustomer.service.ts
packages/server/src/modules/Customers/commands/EditCustomer.service.ts
packages/server/src/modules/Customers/commands/EditOpeningBalanceCustomer.service.ts
packages/server/src/modules/Customers/constants.ts
packages/server/src/modules/Customers/CustomerGLEntries.ts
packages/server/src/modules/Customers/CustomerGLEntriesStorage.ts
packages/server/src/modules/Customers/Customers.controller.ts
packages/server/src/modules/Customers/Customers.module.ts
packages/server/src/modules/Customers/CustomersApplication.service.ts
packages/server/src/modules/Customers/CustomersExportable.ts
packages/server/src/modules/Customers/CustomersImportable.ts
packages/server/src/modules/Customers/dtos/BulkDeleteCustomers.dto.ts
packages/server/src/modules/Customers/dtos/ContactAddress.dto.ts
packages/server/src/modules/Customers/dtos/CreateCustomer.dto.ts
packages/server/src/modules/Customers/dtos/CustomerOpeningBalanceEdit.dto.ts
packages/server/src/modules/Customers/dtos/CustomerResponse.dto.ts
packages/server/src/modules/Customers/dtos/EditCustomer.dto.ts
packages/server/src/modules/Customers/dtos/GetCustomersQuery.dto.ts
packages/server/src/modules/Customers/models/Customer.meta.ts
packages/server/src/modules/Customers/models/Customer.ts
packages/server/src/modules/Customers/queries/CustomerTransformer.ts
packages/server/src/modules/Customers/queries/GetCustomer.service.ts
packages/server/src/modules/Customers/queries/GetCustomers.service.ts
packages/server/src/modules/Customers/subscribers/CustomerGLEntriesSubscriber.ts
packages/server/src/modules/Customers/types/Customers.types.ts
packages/server/src/modules/Customers/ValidateBulkDeleteCustomers.service.ts
packages/server/src/modules/CustomViews/CustomViewBaseModel.ts
packages/server/src/modules/Dashboard/Dashboard.controller.ts
packages/server/src/modules/Dashboard/Dashboard.module.ts
packages/server/src/modules/Dashboard/Dashboard.service.ts
packages/server/src/modules/Dashboard/dtos/GetDashboardBootMetaResponse.dto.ts
packages/server/src/modules/DynamicListing/constants.ts
packages/server/src/modules/DynamicListing/dtos/DynamicFilterQuery.dto.ts
packages/server/src/modules/DynamicListing/DynamicFilter/constants.ts
packages/server/src/modules/DynamicListing/DynamicFilter/DynamicFilter.ts
packages/server/src/modules/DynamicListing/DynamicFilter/DynamicFilter.types.ts
packages/server/src/modules/DynamicListing/DynamicFilter/DynamicFilterAbstractor.ts
packages/server/src/modules/DynamicListing/DynamicFilter/DynamicFilterAdvancedFilter.ts
packages/server/src/modules/DynamicListing/DynamicFilter/DynamicFilterFilterRoles.ts
packages/server/src/modules/DynamicListing/DynamicFilter/DynamicFilterQueryParser.ts
packages/server/src/modules/DynamicListing/DynamicFilter/DynamicFilterRoleAbstractor.ts
packages/server/src/modules/DynamicListing/DynamicFilter/DynamicFilterSearch.ts
packages/server/src/modules/DynamicListing/DynamicFilter/DynamicFilterSortBy.ts
packages/server/src/modules/DynamicListing/DynamicFilter/DynamicFilterViews.ts
packages/server/src/modules/DynamicListing/DynamicFilter/index.ts
packages/server/src/modules/DynamicListing/DynamicList.module.ts
packages/server/src/modules/DynamicListing/DynamicList.service.ts
packages/server/src/modules/DynamicListing/DynamicListCustomView.service.ts
packages/server/src/modules/DynamicListing/DynamicListFilterRoles.service.ts
packages/server/src/modules/DynamicListing/DynamicListSearch.service.ts
packages/server/src/modules/DynamicListing/DynamicListServiceAbstract.ts
packages/server/src/modules/DynamicListing/DynamicListSortBy.service.ts
packages/server/src/modules/DynamicListing/models/CustomViewBaseModel.ts
packages/server/src/modules/DynamicListing/models/MetadataModel.ts
packages/server/src/modules/DynamicListing/models/SearchableBaseModel.ts
packages/server/src/modules/DynamicListing/types/DynamicList.types.ts
packages/server/src/modules/DynamicListing/validators.ts
packages/server/src/modules/EventsTracker/events/AccountEventsTracker.ts
packages/server/src/modules/EventsTracker/events/AuthenticationEventsTracker.ts
packages/server/src/modules/EventsTracker/events/BankRuleEventsTracker.ts
packages/server/src/modules/EventsTracker/events/BankTransactionEventsTracker.ts
packages/server/src/modules/EventsTracker/events/BillEventsTracker.ts
packages/server/src/modules/EventsTracker/events/CustomerEventsTracker.ts
packages/server/src/modules/EventsTracker/events/ExpenseEventsTracker.ts
packages/server/src/modules/EventsTracker/events/ItemEventsTracker.ts
packages/server/src/modules/EventsTracker/events/ManualJournalEventsTracker.ts
packages/server/src/modules/EventsTracker/events/PaymentLinkEventsTracker.ts
packages/server/src/modules/EventsTracker/events/PaymentMadeEventsTracker.ts
packages/server/src/modules/EventsTracker/events/PaymentMethodEventsTracker.ts
packages/server/src/modules/EventsTracker/events/PaymentReceivedEventsTracker.ts
packages/server/src/modules/EventsTracker/events/PdfTemplateEventsTracker.ts
packages/server/src/modules/EventsTracker/events/ReportsEventsTracker.ts
packages/server/src/modules/EventsTracker/events/SaleEstimateEventsTracker.ts
packages/server/src/modules/EventsTracker/events/SaleInvoicesEventsTracker.ts
packages/server/src/modules/EventsTracker/events/StripeIntegrationEventsTracker.ts
packages/server/src/modules/EventsTracker/events/SubscriptionEventsTracker.ts
packages/server/src/modules/EventsTracker/events/TransactionsLockingEventsTracker.ts
packages/server/src/modules/EventsTracker/events/VendorEventsTracker.ts
packages/server/src/modules/EventsTracker/EventTracker.interfaces.ts
packages/server/src/modules/EventsTracker/EventTracker.module.ts
packages/server/src/modules/EventsTracker/EventTracker.service.ts
packages/server/src/modules/EventsTracker/event-tracker.ts
packages/server/src/modules/EventsTracker/PostHog.constants.ts
packages/server/src/modules/EventsTracker/postHog.module.ts
packages/server/src/modules/ExchangeRates/dtos/ExchangeRateLatestQuery.dto.ts
packages/server/src/modules/ExchangeRates/dtos/ExchangeRateLatestResponse.dto.ts
packages/server/src/modules/ExchangeRates/ExchangeRates.application.ts
packages/server/src/modules/ExchangeRates/ExchangeRates.controller.ts
packages/server/src/modules/ExchangeRates/ExchangeRates.module.ts
packages/server/src/modules/ExchangeRates/ExchangeRates.service.ts
packages/server/src/modules/ExchangeRates/ExchangeRates.types.ts
packages/server/src/modules/ExchangeRates/index.ts
packages/server/src/modules/ExchangeRates/lib/ExchangeRate.ts
packages/server/src/modules/ExchangeRates/lib/OpenExchangeRate.ts
packages/server/src/modules/ExchangeRates/lib/types.ts
packages/server/src/modules/Expenses/BulkDeleteExpenses.service.ts
packages/server/src/modules/Expenses/commands/CommandExpenseDTO.transformer.ts
packages/server/src/modules/Expenses/commands/CommandExpenseValidator.service.ts
packages/server/src/modules/Expenses/commands/CreateExpense.service.ts
packages/server/src/modules/Expenses/commands/DeleteExpense.service.ts
packages/server/src/modules/Expenses/commands/EditExpense.service.ts
packages/server/src/modules/Expenses/commands/PublishExpense.service.ts
packages/server/src/modules/Expenses/constants.ts
packages/server/src/modules/Expenses/dtos/Expense.dto.ts
packages/server/src/modules/Expenses/dtos/ExpenseResponse.dto.ts
packages/server/src/modules/Expenses/dtos/GetExpensesQuery.dto.ts
packages/server/src/modules/Expenses/Expenses.controller.ts
packages/server/src/modules/Expenses/Expenses.module.ts
packages/server/src/modules/Expenses/Expenses.types.ts
packages/server/src/modules/Expenses/ExpensesApplication.service.ts
packages/server/src/modules/Expenses/ExpensesExportable.ts
packages/server/src/modules/Expenses/ExpensesImportable.ts
packages/server/src/modules/Expenses/interfaces/Expenses.interface.ts
packages/server/src/modules/Expenses/models/Expense.meta.ts
packages/server/src/modules/Expenses/models/Expense.model.ts
packages/server/src/modules/Expenses/models/ExpenseCategory.model.ts
packages/server/src/modules/Expenses/queries/Expense.transformer.ts
packages/server/src/modules/Expenses/queries/ExpenseCategory.transformer.ts
packages/server/src/modules/Expenses/queries/GetExpense.service.ts
packages/server/src/modules/Expenses/queries/GetExpenses.service.ts
packages/server/src/modules/Expenses/subscribers/ExpenseGL.ts
packages/server/src/modules/Expenses/subscribers/ExpenseGLEntries.service.ts
packages/server/src/modules/Expenses/subscribers/ExpenseGLEntries.subscriber.ts
packages/server/src/modules/Expenses/subscribers/ExpenseGLEntriesStorage.sevice.ts
packages/server/src/modules/Expenses/ValidateBulkDeleteExpenses.service.ts
packages/server/src/modules/Export/common.ts
packages/server/src/modules/Export/constants.ts
packages/server/src/modules/Export/decorators/ExportableModel.decorator.ts
packages/server/src/modules/Export/dtos/ExportQuery.dto.ts
packages/server/src/modules/Export/Export.controller.ts
packages/server/src/modules/Export/Export.module.ts
packages/server/src/modules/Export/Export.utils.ts
packages/server/src/modules/Export/Exportable.ts
packages/server/src/modules/Export/ExportAls.ts
packages/server/src/modules/Export/ExportApplication.ts
packages/server/src/modules/Export/ExportPdf.ts
packages/server/src/modules/Export/ExportRegistery.ts
packages/server/src/modules/Export/ExportService.ts
packages/server/src/modules/Export/utils.ts
packages/server/src/modules/Features/Features.module.ts
packages/server/src/modules/Features/FeaturesConfigure.ts
packages/server/src/modules/Features/FeaturesConfigureManager.ts
packages/server/src/modules/Features/FeaturesManager.ts
packages/server/src/modules/Features/FeaturesSettingsDriver.ts
packages/server/src/modules/FinancialStatements/common/FinancialDatePeriods.ts
packages/server/src/modules/FinancialStatements/common/FinancialDateRanges.ts
packages/server/src/modules/FinancialStatements/common/FinancialEvaluateEquation.ts
packages/server/src/modules/FinancialStatements/common/FinancialFilter.ts
packages/server/src/modules/FinancialStatements/common/FinancialHorizTotals.ts
packages/server/src/modules/FinancialStatements/common/FinancialPreviousPeriod.ts
packages/server/src/modules/FinancialStatements/common/FinancialPreviousYear.ts
packages/server/src/modules/FinancialStatements/common/FinancialReportService.ts
packages/server/src/modules/FinancialStatements/common/FinancialSchema.ts
packages/server/src/modules/FinancialStatements/common/FinancialSheet.ts
packages/server/src/modules/FinancialStatements/common/FinancialSheetCommon.module.ts
packages/server/src/modules/FinancialStatements/common/FinancialSheetMeta.ts
packages/server/src/modules/FinancialStatements/common/FinancialSheetStructure.ts
packages/server/src/modules/FinancialStatements/common/FinancialTable.ts
packages/server/src/modules/FinancialStatements/common/FinancialTablePreviousPeriod.ts
packages/server/src/modules/FinancialStatements/common/FinancialTablePreviousYear.ts
packages/server/src/modules/FinancialStatements/common/FinancialTableStructure.ts
packages/server/src/modules/FinancialStatements/common/TableSheet.ts
packages/server/src/modules/FinancialStatements/common/TableSheetPdf.ts
packages/server/src/modules/FinancialStatements/dtos/FinancialReportResponse.dto.ts
packages/server/src/modules/FinancialStatements/dtos/FinancialSheetBranchesQuery.dto.ts
packages/server/src/modules/FinancialStatements/FinancialStatements.module.ts
packages/server/src/modules/FinancialStatements/modules/AgingSummary/_constants.ts
packages/server/src/modules/FinancialStatements/modules/AgingSummary/AgingReport.ts
packages/server/src/modules/FinancialStatements/modules/AgingSummary/AgingSummary.module.ts
packages/server/src/modules/FinancialStatements/modules/AgingSummary/AgingSummary.ts
packages/server/src/modules/FinancialStatements/modules/AgingSummary/AgingSummary.types.ts
packages/server/src/modules/FinancialStatements/modules/AgingSummary/AgingSummaryMeta.ts
packages/server/src/modules/FinancialStatements/modules/AgingSummary/AgingSummaryTable.ts
packages/server/src/modules/FinancialStatements/modules/APAgingSummary/APAgingSummary.controller.ts
packages/server/src/modules/FinancialStatements/modules/APAgingSummary/APAgingSummary.module.ts
packages/server/src/modules/FinancialStatements/modules/APAgingSummary/APAgingSummary.swagger.ts
packages/server/src/modules/FinancialStatements/modules/APAgingSummary/APAgingSummary.types.ts
packages/server/src/modules/FinancialStatements/modules/APAgingSummary/APAgingSummaryApplication.ts
packages/server/src/modules/FinancialStatements/modules/APAgingSummary/APAgingSummaryExportInjectable.ts
packages/server/src/modules/FinancialStatements/modules/APAgingSummary/APAgingSummaryMeta.ts
packages/server/src/modules/FinancialStatements/modules/APAgingSummary/APAgingSummaryPdfInjectable.ts
packages/server/src/modules/FinancialStatements/modules/APAgingSummary/APAgingSummaryQuery.dto.ts
packages/server/src/modules/FinancialStatements/modules/APAgingSummary/APAgingSummaryRepository.ts
packages/server/src/modules/FinancialStatements/modules/APAgingSummary/APAgingSummaryResponse.dto.ts
packages/server/src/modules/FinancialStatements/modules/APAgingSummary/APAgingSummaryService.ts
packages/server/src/modules/FinancialStatements/modules/APAgingSummary/APAgingSummarySheet.ts
packages/server/src/modules/FinancialStatements/modules/APAgingSummary/APAgingSummaryTable.ts
packages/server/src/modules/FinancialStatements/modules/APAgingSummary/APAgingSummaryTableInjectable.ts
packages/server/src/modules/FinancialStatements/modules/APAgingSummary/utils.ts
packages/server/src/modules/FinancialStatements/modules/ARAgingSummary/ARAgingSummary.controller.ts
packages/server/src/modules/FinancialStatements/modules/ARAgingSummary/ARAgingSummary.module.ts
packages/server/src/modules/FinancialStatements/modules/ARAgingSummary/ARAgingSummary.swagger.ts
packages/server/src/modules/FinancialStatements/modules/ARAgingSummary/ARAgingSummary.types.ts
packages/server/src/modules/FinancialStatements/modules/ARAgingSummary/ARAgingSummaryApplication.ts
packages/server/src/modules/FinancialStatements/modules/ARAgingSummary/ARAgingSummaryExportInjectable.ts
packages/server/src/modules/FinancialStatements/modules/ARAgingSummary/ARAgingSummaryMeta.ts
packages/server/src/modules/FinancialStatements/modules/ARAgingSummary/ARAgingSummaryPdfInjectable.ts
packages/server/src/modules/FinancialStatements/modules/ARAgingSummary/ARAgingSummaryQuery.dto.ts
packages/server/src/modules/FinancialStatements/modules/ARAgingSummary/ARAgingSummaryRepository.ts
packages/server/src/modules/FinancialStatements/modules/ARAgingSummary/ARAgingSummaryResponse.dto.ts
packages/server/src/modules/FinancialStatements/modules/ARAgingSummary/ARAgingSummaryService.ts
packages/server/src/modules/FinancialStatements/modules/ARAgingSummary/ARAgingSummarySheet.ts
packages/server/src/modules/FinancialStatements/modules/ARAgingSummary/ARAgingSummaryTable.ts
packages/server/src/modules/FinancialStatements/modules/ARAgingSummary/ARAgingSummaryTableInjectable.ts
packages/server/src/modules/FinancialStatements/modules/ARAgingSummary/utils.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheet.controller.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheet.dto.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheet.module.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheet.swagger.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheet.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheet.types.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetAccounts.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetAggregators.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetApplication.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetBase.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetComparsionPreviousPeriod.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetComparsionPreviousYear.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetDatePeriods.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetExportInjectable.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetFiltering.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetInjectable.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetMeta.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetNetIncome.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetNetIncomeDatePeriods.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetNetIncomeDatePeriodsPP.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetNetIncomeDatePeriodsPY.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetNetIncomePP.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetNetIncomePY.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetPdfInjectable.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetPercentage.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetQuery.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetRepository.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetRepositoryNetIncome.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetResponse.dto.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetSchema.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetTable.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetTableDatePeriods.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetTableInjectable.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetTablePercentage.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetTablePreviousPeriod.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetTablePreviousYear.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheetTotal.ts
packages/server/src/modules/FinancialStatements/modules/BalanceSheet/constants.ts
packages/server/src/modules/FinancialStatements/modules/CashFlowStatement/Cashflow.controller.ts
packages/server/src/modules/FinancialStatements/modules/CashFlowStatement/CashFlow.ts
packages/server/src/modules/FinancialStatements/modules/CashFlowStatement/Cashflow.types.ts
packages/server/src/modules/FinancialStatements/modules/CashFlowStatement/CashFlowDatePeriods.ts
packages/server/src/modules/FinancialStatements/modules/CashFlowStatement/CashflowExportInjectable.ts
packages/server/src/modules/FinancialStatements/modules/CashFlowStatement/CashFlowRepository.ts
packages/server/src/modules/FinancialStatements/modules/CashFlowStatement/CashFlowService.ts
packages/server/src/modules/FinancialStatements/modules/CashFlowStatement/CashflowSheetApplication.ts
packages/server/src/modules/FinancialStatements/modules/CashFlowStatement/CashflowSheetMeta.ts
packages/server/src/modules/FinancialStatements/modules/CashFlowStatement/CashflowStatement.module.ts
packages/server/src/modules/FinancialStatements/modules/CashFlowStatement/CashflowStatement.swagger.ts
packages/server/src/modules/FinancialStatements/modules/CashFlowStatement/CashflowStatementBase.ts
packages/server/src/modules/FinancialStatements/modules/CashFlowStatement/CashFlowStatementQuery.dto.ts
packages/server/src/modules/FinancialStatements/modules/CashFlowStatement/CashflowStatementResponse.dto.ts
packages/server/src/modules/FinancialStatements/modules/CashFlowStatement/CashFlowTable.ts
packages/server/src/modules/FinancialStatements/modules/CashFlowStatement/CashflowTableInjectable.ts
packages/server/src/modules/FinancialStatements/modules/CashFlowStatement/CashflowTablePdfInjectable.ts
packages/server/src/modules/FinancialStatements/modules/CashFlowStatement/constants.ts
packages/server/src/modules/FinancialStatements/modules/CashFlowStatement/schema.ts
packages/server/src/modules/FinancialStatements/modules/ContactBalanceSummary/ContactBalanceSummary.ts
packages/server/src/modules/FinancialStatements/modules/ContactBalanceSummary/ContactBalanceSummary.types.ts
packages/server/src/modules/FinancialStatements/modules/ContactBalanceSummary/ContactBalanceSummaryQuery.dto.ts
packages/server/src/modules/FinancialStatements/modules/CustomerBalanceSummary/_utils.ts
packages/server/src/modules/FinancialStatements/modules/CustomerBalanceSummary/constants.ts
packages/server/src/modules/FinancialStatements/modules/CustomerBalanceSummary/CustomerBalanceSummary.controller.ts
packages/server/src/modules/FinancialStatements/modules/CustomerBalanceSummary/CustomerBalanceSummary.module.ts
packages/server/src/modules/FinancialStatements/modules/CustomerBalanceSummary/CustomerBalanceSummary.ts
packages/server/src/modules/FinancialStatements/modules/CustomerBalanceSummary/CustomerBalanceSummary.types.ts
packages/server/src/modules/FinancialStatements/modules/CustomerBalanceSummary/CustomerBalanceSummaryApplication.ts
packages/server/src/modules/FinancialStatements/modules/CustomerBalanceSummary/CustomerBalanceSummaryExportInjectable.ts
packages/server/src/modules/FinancialStatements/modules/CustomerBalanceSummary/CustomerBalanceSummaryMeta.ts
packages/server/src/modules/FinancialStatements/modules/CustomerBalanceSummary/CustomerBalanceSummaryPdf.ts
packages/server/src/modules/FinancialStatements/modules/CustomerBalanceSummary/CustomerBalanceSummaryQuery.dto.ts
packages/server/src/modules/FinancialStatements/modules/CustomerBalanceSummary/CustomerBalanceSummaryRepository.ts
packages/server/src/modules/FinancialStatements/modules/CustomerBalanceSummary/CustomerBalanceSummaryResponse.dto.ts
packages/server/src/modules/FinancialStatements/modules/CustomerBalanceSummary/CustomerBalanceSummaryService.ts
packages/server/src/modules/FinancialStatements/modules/CustomerBalanceSummary/CustomerBalanceSummaryTableInjectable.ts
packages/server/src/modules/FinancialStatements/modules/CustomerBalanceSummary/CustomerBalanceSummaryTableRows.ts
packages/server/src/modules/FinancialStatements/modules/GeneralLedger/_utils.ts
packages/server/src/modules/FinancialStatements/modules/GeneralLedger/constants.ts
packages/server/src/modules/FinancialStatements/modules/GeneralLedger/GeneralLedger.controller.ts
packages/server/src/modules/FinancialStatements/modules/GeneralLedger/GeneralLedger.module.ts
packages/server/src/modules/FinancialStatements/modules/GeneralLedger/GeneralLedger.swagger.ts
packages/server/src/modules/FinancialStatements/modules/GeneralLedger/GeneralLedger.ts
packages/server/src/modules/FinancialStatements/modules/GeneralLedger/GeneralLedger.types.ts
packages/server/src/modules/FinancialStatements/modules/GeneralLedger/GeneralLedgerApplication.ts
packages/server/src/modules/FinancialStatements/modules/GeneralLedger/GeneralLedgerExport.ts
packages/server/src/modules/FinancialStatements/modules/GeneralLedger/GeneralLedgerMeta.ts
packages/server/src/modules/FinancialStatements/modules/GeneralLedger/GeneralLedgerPdf.ts
packages/server/src/modules/FinancialStatements/modules/GeneralLedger/GeneralLedgerQuery.dto.ts
packages/server/src/modules/FinancialStatements/modules/GeneralLedger/GeneralLedgerRepository.ts
packages/server/src/modules/FinancialStatements/modules/GeneralLedger/GeneralLedgerResponse.dto.ts
packages/server/src/modules/FinancialStatements/modules/GeneralLedger/GeneralLedgerService.ts
packages/server/src/modules/FinancialStatements/modules/GeneralLedger/GeneralLedgerTable.ts
packages/server/src/modules/FinancialStatements/modules/GeneralLedger/GeneralLedgerTableInjectable.ts
packages/server/src/modules/FinancialStatements/modules/GeneralLedger/utils.ts
packages/server/src/modules/FinancialStatements/modules/InventoryItemDetails/constant.ts
packages/server/src/modules/FinancialStatements/modules/InventoryItemDetails/InventoryItemDetails.controller.ts
packages/server/src/modules/FinancialStatements/modules/InventoryItemDetails/InventoryItemDetails.module.ts
packages/server/src/modules/FinancialStatements/modules/InventoryItemDetails/InventoryItemDetails.service.ts
packages/server/src/modules/FinancialStatements/modules/InventoryItemDetails/InventoryItemDetails.ts
packages/server/src/modules/FinancialStatements/modules/InventoryItemDetails/InventoryItemDetails.types.ts
packages/server/src/modules/FinancialStatements/modules/InventoryItemDetails/InventoryItemDetailsApplication.ts
packages/server/src/modules/FinancialStatements/modules/InventoryItemDetails/InventoryItemDetailsExportInjectable.ts
packages/server/src/modules/FinancialStatements/modules/InventoryItemDetails/InventoryItemDetailsMeta.ts
packages/server/src/modules/FinancialStatements/modules/InventoryItemDetails/InventoryItemDetailsQuery.dto.ts
packages/server/src/modules/FinancialStatements/modules/InventoryItemDetails/InventoryItemDetailsRepository.ts
packages/server/src/modules/FinancialStatements/modules/InventoryItemDetails/InventoryItemDetailsResponse.dto.ts
packages/server/src/modules/FinancialStatements/modules/InventoryItemDetails/InventoryItemDetailsTable.ts
packages/server/src/modules/FinancialStatements/modules/InventoryItemDetails/InventoryItemDetailsTableInjectable.ts
packages/server/src/modules/FinancialStatements/modules/InventoryItemDetails/InventoryItemDetailsTablePdf.ts
packages/server/src/modules/FinancialStatements/modules/InventoryValuationSheet/_constants.ts
packages/server/src/modules/FinancialStatements/modules/InventoryValuationSheet/InventoryValuation.controller.ts
packages/server/src/modules/FinancialStatements/modules/InventoryValuationSheet/InventoryValuationQuery.dto.ts
packages/server/src/modules/FinancialStatements/modules/InventoryValuationSheet/InventoryValuationResponse.dto.ts
packages/server/src/modules/FinancialStatements/modules/InventoryValuationSheet/InventoryValuationSheet.module.ts
packages/server/src/modules/FinancialStatements/modules/InventoryValuationSheet/InventoryValuationSheet.ts
packages/server/src/modules/FinancialStatements/modules/InventoryValuationSheet/InventoryValuationSheet.types.ts
packages/server/src/modules/FinancialStatements/modules/InventoryValuationSheet/InventoryValuationSheetApplication.ts
packages/server/src/modules/FinancialStatements/modules/InventoryValuationSheet/InventoryValuationSheetExportable.ts
packages/server/src/modules/FinancialStatements/modules/InventoryValuationSheet/InventoryValuationSheetMeta.ts
packages/server/src/modules/FinancialStatements/modules/InventoryValuationSheet/InventoryValuationSheetPdf.ts
packages/server/src/modules/FinancialStatements/modules/InventoryValuationSheet/InventoryValuationSheetRepository.ts
packages/server/src/modules/FinancialStatements/modules/InventoryValuationSheet/InventoryValuationSheetService.ts
packages/server/src/modules/FinancialStatements/modules/InventoryValuationSheet/InventoryValuationSheetTable.ts
packages/server/src/modules/FinancialStatements/modules/InventoryValuationSheet/InventoryValuationSheetTableInjectable.ts
packages/server/src/modules/FinancialStatements/modules/JournalSheet/constant.ts
packages/server/src/modules/FinancialStatements/modules/JournalSheet/JournalSheet.controller.ts
packages/server/src/modules/FinancialStatements/modules/JournalSheet/JournalSheet.module.ts
packages/server/src/modules/FinancialStatements/modules/JournalSheet/JournalSheet.swagger.ts
packages/server/src/modules/FinancialStatements/modules/JournalSheet/JournalSheet.ts
packages/server/src/modules/FinancialStatements/modules/JournalSheet/JournalSheet.types.ts
packages/server/src/modules/FinancialStatements/modules/JournalSheet/JournalSheetApplication.ts
packages/server/src/modules/FinancialStatements/modules/JournalSheet/JournalSheetExport.ts
packages/server/src/modules/FinancialStatements/modules/JournalSheet/JournalSheetMeta.ts
packages/server/src/modules/FinancialStatements/modules/JournalSheet/JournalSheetPdfInjectable.ts
packages/server/src/modules/FinancialStatements/modules/JournalSheet/JournalSheetQuery.dto.ts
packages/server/src/modules/FinancialStatements/modules/JournalSheet/JournalSheetRepository.ts
packages/server/src/modules/FinancialStatements/modules/JournalSheet/JournalSheetResponse.dto.ts
packages/server/src/modules/FinancialStatements/modules/JournalSheet/JournalSheetService.ts
packages/server/src/modules/FinancialStatements/modules/JournalSheet/JournalSheetTable.ts
packages/server/src/modules/FinancialStatements/modules/JournalSheet/JournalSheetTableInjectable.ts
packages/server/src/modules/FinancialStatements/modules/JournalSheet/types.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/constants.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSchema.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheet.controller.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheet.module.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheet.swagger.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheet.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheet.types.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheetApplication.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheetBase.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheetDatePeriods.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheetExportInjectable.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheetFilter.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheetMeta.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheetPercentage.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheetPreviousPeriod.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheetPreviousYear.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheetQuery.dto.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheetQuery.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheetRepository.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheetResponse.dto.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheetService.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheetTable.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheetTableDatePeriods.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheetTableInjectable.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheetTablePercentage.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossTablePdfInjectable.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossTablePreviousPeriod.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossTablePreviousYear.ts
packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/utils.ts
packages/server/src/modules/FinancialStatements/modules/PurchasesByItems/_types.ts
packages/server/src/modules/FinancialStatements/modules/PurchasesByItems/PurchasesByItems.controller.ts
packages/server/src/modules/FinancialStatements/modules/PurchasesByItems/PurchasesByItems.module.ts
packages/server/src/modules/FinancialStatements/modules/PurchasesByItems/PurchasesByItems.service.ts
packages/server/src/modules/FinancialStatements/modules/PurchasesByItems/PurchasesByItems.ts
packages/server/src/modules/FinancialStatements/modules/PurchasesByItems/PurchasesByItemsApplication.ts
packages/server/src/modules/FinancialStatements/modules/PurchasesByItems/PurchasesByItemsExport.ts
packages/server/src/modules/FinancialStatements/modules/PurchasesByItems/PurchasesByItemsMeta.ts
packages/server/src/modules/FinancialStatements/modules/PurchasesByItems/PurchasesByItemsPdf.ts
packages/server/src/modules/FinancialStatements/modules/PurchasesByItems/PurchasesByItemsQuery.dto.ts
packages/server/src/modules/FinancialStatements/modules/PurchasesByItems/PurchasesByItemsResponse.dto.ts
packages/server/src/modules/FinancialStatements/modules/PurchasesByItems/PurchasesByItemsTable.ts
packages/server/src/modules/FinancialStatements/modules/PurchasesByItems/PurchasesByItemsTableInjectable.ts
packages/server/src/modules/FinancialStatements/modules/PurchasesByItems/types/PurchasesByItems.types.ts
packages/server/src/modules/FinancialStatements/modules/PurchasesByItems/utils.ts
packages/server/src/modules/FinancialStatements/modules/SalesByItems/constants.ts
packages/server/src/modules/FinancialStatements/modules/SalesByItems/SalesByItems.controller.ts
packages/server/src/modules/FinancialStatements/modules/SalesByItems/SalesByItems.module.ts
packages/server/src/modules/FinancialStatements/modules/SalesByItems/SalesByItems.ts
packages/server/src/modules/FinancialStatements/modules/SalesByItems/SalesByItems.types.ts
packages/server/src/modules/FinancialStatements/modules/SalesByItems/SalesByItemsApplication.ts
packages/server/src/modules/FinancialStatements/modules/SalesByItems/SalesByItemsExport.ts
packages/server/src/modules/FinancialStatements/modules/SalesByItems/SalesByItemsMeta.ts
packages/server/src/modules/FinancialStatements/modules/SalesByItems/SalesByItemsPdfInjectable.ts
packages/server/src/modules/FinancialStatements/modules/SalesByItems/SalesByItemsQuery.dto.ts
packages/server/src/modules/FinancialStatements/modules/SalesByItems/SalesByItemsResponse.dto.ts
packages/server/src/modules/FinancialStatements/modules/SalesByItems/SalesByItemsService.ts
packages/server/src/modules/FinancialStatements/modules/SalesByItems/SalesByItemsTable.ts
packages/server/src/modules/FinancialStatements/modules/SalesByItems/SalesByItemsTableInjectable.ts
packages/server/src/modules/FinancialStatements/modules/SalesByItems/utils.ts
packages/server/src/modules/FinancialStatements/modules/SalesTaxLiabilitySummary/_constants.ts
packages/server/src/modules/FinancialStatements/modules/SalesTaxLiabilitySummary/dtos/SalesTaxLiabilityQuery.dto.ts
packages/server/src/modules/FinancialStatements/modules/SalesTaxLiabilitySummary/SalesTaxLiability.module.ts
packages/server/src/modules/FinancialStatements/modules/SalesTaxLiabilitySummary/SalesTaxLiability.types.ts
packages/server/src/modules/FinancialStatements/modules/SalesTaxLiabilitySummary/SalesTaxLiabilitySummary.controller.ts
packages/server/src/modules/FinancialStatements/modules/SalesTaxLiabilitySummary/SalesTaxLiabilitySummary.ts
packages/server/src/modules/FinancialStatements/modules/SalesTaxLiabilitySummary/SalesTaxLiabilitySummaryApplication.ts
packages/server/src/modules/FinancialStatements/modules/SalesTaxLiabilitySummary/SalesTaxLiabilitySummaryExportInjectable.ts
packages/server/src/modules/FinancialStatements/modules/SalesTaxLiabilitySummary/SalesTaxLiabilitySummaryMeta.ts
packages/server/src/modules/FinancialStatements/modules/SalesTaxLiabilitySummary/SalesTaxLiabilitySummaryRepository.ts
packages/server/src/modules/FinancialStatements/modules/SalesTaxLiabilitySummary/SalesTaxLiabilitySummaryResponse.dto.ts
packages/server/src/modules/FinancialStatements/modules/SalesTaxLiabilitySummary/SalesTaxLiabilitySummaryService.ts
packages/server/src/modules/FinancialStatements/modules/SalesTaxLiabilitySummary/SalesTaxLiabilitySummaryTable.ts
packages/server/src/modules/FinancialStatements/modules/SalesTaxLiabilitySummary/SalesTaxLiabilitySummaryTableInjectable.ts
packages/server/src/modules/FinancialStatements/modules/SalesTaxLiabilitySummary/SalesTaxLiabiltiySummaryPdf.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByContact/TransactionsByContact.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByContact/TransactionsByContact.types.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByContact/TransactionsByContactQuery.dto.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByContact/TransactionsByContactRepository.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByContact/TransactionsByContactTableRows.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByCustomer/TransactionsByCustomer.controller.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByCustomer/TransactionsByCustomer.module.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByCustomer/TransactionsByCustomer.types.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByCustomer/TransactionsByCustomerQuery.dto.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByCustomer/TransactionsByCustomerResponse.dto.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByCustomer/TransactionsByCustomers.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByCustomer/TransactionsByCustomersApplication.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByCustomer/TransactionsByCustomersExportInjectable.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByCustomer/TransactionsByCustomersMeta.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByCustomer/TransactionsByCustomersPdf.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByCustomer/TransactionsByCustomersRepository.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByCustomer/TransactionsByCustomersService.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByCustomer/TransactionsByCustomersTable.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByCustomer/TransactionsByCustomersTableInjectable.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByCustomer/utils.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByReference/_utils.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByReference/TransactionByReference.module.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByReference/TransactionsByReference.controller.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByReference/TransactionsByReference.service.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByReference/TransactionsByReference.types.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByReference/TransactionsByReferenceApplication.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByReference/TransactionsByReferenceQuery.dto.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByReference/TransactionsByReferenceReport.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByReference/TransactionsByReferenceRepository.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByVendor/constants.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByVendor/TransactionsByVendor.controller.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByVendor/TransactionsByVendor.module.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByVendor/TransactionsByVendor.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByVendor/TransactionsByVendor.types.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByVendor/TransactionsByVendorApplication.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByVendor/TransactionsByVendorExportInjectable.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByVendor/TransactionsByVendorInjectable.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByVendor/TransactionsByVendorMeta.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByVendor/TransactionsByVendorPdf.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByVendor/TransactionsByVendorQuery.dto.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByVendor/TransactionsByVendorRepository.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByVendor/TransactionsByVendorResponse.dto.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByVendor/TransactionsByVendorTable.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByVendor/TransactionsByVendorTableInjectable.ts
packages/server/src/modules/FinancialStatements/modules/TransactionsByVendor/utils.ts
packages/server/src/modules/FinancialStatements/modules/TrialBalanceSheet/_constants.ts
packages/server/src/modules/FinancialStatements/modules/TrialBalanceSheet/_types.ts
packages/server/src/modules/FinancialStatements/modules/TrialBalanceSheet/_utils.ts
packages/server/src/modules/FinancialStatements/modules/TrialBalanceSheet/TrialBalanceExportInjectable.ts
packages/server/src/modules/FinancialStatements/modules/TrialBalanceSheet/TrialBalanceSheet.controller.ts
packages/server/src/modules/FinancialStatements/modules/TrialBalanceSheet/TrialBalanceSheet.module.ts
packages/server/src/modules/FinancialStatements/modules/TrialBalanceSheet/TrialBalanceSheet.swagger.ts
packages/server/src/modules/FinancialStatements/modules/TrialBalanceSheet/TrialBalanceSheet.ts
packages/server/src/modules/FinancialStatements/modules/TrialBalanceSheet/TrialBalanceSheet.types.ts
packages/server/src/modules/FinancialStatements/modules/TrialBalanceSheet/TrialBalanceSheetApplication.ts
packages/server/src/modules/FinancialStatements/modules/TrialBalanceSheet/TrialBalanceSheetInjectable.ts
packages/server/src/modules/FinancialStatements/modules/TrialBalanceSheet/TrialBalanceSheetMeta.ts
packages/server/src/modules/FinancialStatements/modules/TrialBalanceSheet/TrialBalanceSheetPdfInjectsable.ts
packages/server/src/modules/FinancialStatements/modules/TrialBalanceSheet/TrialBalanceSheetQuery.dto.ts
packages/server/src/modules/FinancialStatements/modules/TrialBalanceSheet/TrialBalanceSheetRepository.ts
packages/server/src/modules/FinancialStatements/modules/TrialBalanceSheet/TrialBalanceSheetResponse.dto.ts
packages/server/src/modules/FinancialStatements/modules/TrialBalanceSheet/TrialBalanceSheetTable.ts
packages/server/src/modules/FinancialStatements/modules/TrialBalanceSheet/TrialBalanceSheetTableInjectable.ts
packages/server/src/modules/FinancialStatements/modules/VendorBalanceSummary/constants.ts
packages/server/src/modules/FinancialStatements/modules/VendorBalanceSummary/utils.ts
packages/server/src/modules/FinancialStatements/modules/VendorBalanceSummary/VendorBalanceSummary.controller.ts
packages/server/src/modules/FinancialStatements/modules/VendorBalanceSummary/VendorBalanceSummary.module.ts
packages/server/src/modules/FinancialStatements/modules/VendorBalanceSummary/VendorBalanceSummary.ts
packages/server/src/modules/FinancialStatements/modules/VendorBalanceSummary/VendorBalanceSummary.types.ts
packages/server/src/modules/FinancialStatements/modules/VendorBalanceSummary/VendorBalanceSummaryApplication.ts
packages/server/src/modules/FinancialStatements/modules/VendorBalanceSummary/VendorBalanceSummaryExportInjectable.ts
packages/server/src/modules/FinancialStatements/modules/VendorBalanceSummary/VendorBalanceSummaryMeta.ts
packages/server/src/modules/FinancialStatements/modules/VendorBalanceSummary/VendorBalanceSummaryPdf.ts
packages/server/src/modules/FinancialStatements/modules/VendorBalanceSummary/VendorBalanceSummaryQuery.dto.ts
packages/server/src/modules/FinancialStatements/modules/VendorBalanceSummary/VendorBalanceSummaryRepository.ts
packages/server/src/modules/FinancialStatements/modules/VendorBalanceSummary/VendorBalanceSummaryResponse.dto.ts
packages/server/src/modules/FinancialStatements/modules/VendorBalanceSummary/VendorBalanceSummaryService.ts
packages/server/src/modules/FinancialStatements/modules/VendorBalanceSummary/VendorBalanceSummaryTableInjectable.ts
packages/server/src/modules/FinancialStatements/modules/VendorBalanceSummary/VendorBalanceSummaryTableRows.ts
packages/server/src/modules/FinancialStatements/types/Report.types.ts
packages/server/src/modules/FinancialStatements/types/Table.types.ts
packages/server/src/modules/FinancialStatements/utils.ts
packages/server/src/modules/FinancialStatements/utils/Table.utils.ts
packages/server/src/modules/Import/_constants.ts
packages/server/src/modules/Import/_utils.spec.ts
packages/server/src/modules/Import/_utils.ts
packages/server/src/modules/Import/decorators/Import.decorator.ts
packages/server/src/modules/Import/Import.controller.ts
packages/server/src/modules/Import/Import.module.ts
packages/server/src/modules/Import/Importable.ts
packages/server/src/modules/Import/ImportableRegistry.ts
packages/server/src/modules/Import/ImportALS.ts
packages/server/src/modules/Import/ImportFileCommon.ts
packages/server/src/modules/Import/ImportFileDataTransformer.ts
packages/server/src/modules/Import/ImportFileDataValidator.ts
packages/server/src/modules/Import/ImportFileMapping.ts
packages/server/src/modules/Import/ImportFileMeta.ts
packages/server/src/modules/Import/ImportFileMetaTransformer.ts
packages/server/src/modules/Import/ImportFilePreview.ts
packages/server/src/modules/Import/ImportFileProcess.ts
packages/server/src/modules/Import/ImportFileProcessCommit.ts
packages/server/src/modules/Import/ImportFileUpload.ts
packages/server/src/modules/Import/ImportMulter.utils.ts
packages/server/src/modules/Import/ImportRemoveExpiredFiles.ts
packages/server/src/modules/Import/ImportResource.module.ts
packages/server/src/modules/Import/ImportResourceApplication.ts
packages/server/src/modules/Import/ImportSample.ts
packages/server/src/modules/Import/interfaces.ts
packages/server/src/modules/Import/jobs/ImportDeleteExpiredFilesJob.ts
packages/server/src/modules/Import/models/Import.ts
packages/server/src/modules/Import/sheet_utils.ts
packages/server/src/modules/InventoryAdjutments/commands/CreateQuickInventoryAdjustment.service.ts
packages/server/src/modules/InventoryAdjutments/commands/DeleteInventoryAdjustment.service.ts
packages/server/src/modules/InventoryAdjutments/commands/ledger/InventoryAdjustmentGL.ts
packages/server/src/modules/InventoryAdjutments/commands/ledger/InventoryAdjustmentsGLEntries.ts
packages/server/src/modules/InventoryAdjutments/commands/PublishInventoryAdjustment.service.ts
packages/server/src/modules/InventoryAdjutments/constants/InventoryAdjustments.constants.ts
packages/server/src/modules/InventoryAdjutments/dtos/CreateQuickInventoryAdjustment.dto.ts
packages/server/src/modules/InventoryAdjutments/dtos/InventoryAdjustmentResponse.dto.ts
packages/server/src/modules/InventoryAdjutments/dtos/InventoryAdjustmentsFilter.dto.ts
packages/server/src/modules/InventoryAdjutments/dtos/InventoryAdjustmentsListResponse.dto.ts
packages/server/src/modules/InventoryAdjutments/inventory/InventoryAdjustmentInventoryTransactions.ts
packages/server/src/modules/InventoryAdjutments/inventory/InventoryAdjustmentInventoryTransactionsSubscriber.ts
packages/server/src/modules/InventoryAdjutments/InventoryAdjustments.controller.ts
packages/server/src/modules/InventoryAdjutments/InventoryAdjustments.module.ts
packages/server/src/modules/InventoryAdjutments/InventoryAdjustmentsApplication.service.ts
packages/server/src/modules/InventoryAdjutments/InventoryAdjustmentTransformer.ts
packages/server/src/modules/InventoryAdjutments/models/InventoryAdjustment.meta.ts
packages/server/src/modules/InventoryAdjutments/models/InventoryAdjustment.ts
packages/server/src/modules/InventoryAdjutments/models/InventoryAdjustmentEntry.ts
packages/server/src/modules/InventoryAdjutments/queries/GetInventoryAdjustment.service.ts
packages/server/src/modules/InventoryAdjutments/queries/GetInventoryAdjustments.service.ts
packages/server/src/modules/InventoryAdjutments/subscribers/InventoryAdjustmentGL.subscriber.ts
packages/server/src/modules/InventoryAdjutments/types/InventoryAdjustments.types.ts
packages/server/src/modules/InventoryCost/commands/InventoryAverageCostMethod.service.ts
packages/server/src/modules/InventoryCost/commands/InventoryAverageCostMethod.ts
packages/server/src/modules/InventoryCost/commands/InventoryComputeCost.service.ts
packages/server/src/modules/InventoryCost/commands/InventoryCostGLStorage.service.ts
packages/server/src/modules/InventoryCost/commands/InventoryCosts.service.ts
packages/server/src/modules/InventoryCost/commands/InventoryItemOpeningAvgCost.service.ts
packages/server/src/modules/InventoryCost/commands/InventoryItemsQuantitySync.service.ts
packages/server/src/modules/InventoryCost/commands/InventoryTransactions.service.ts
packages/server/src/modules/InventoryCost/commands/StoreInventortyLotsCost.service.ts
packages/server/src/modules/InventoryCost/dtos/GetInventoryItemsCostQuery.dto.ts
packages/server/src/modules/InventoryCost/dtos/GetInventoryItemsCostResponse.dto.ts
packages/server/src/modules/InventoryCost/InventoryCost.controller.ts
packages/server/src/modules/InventoryCost/InventoryCost.module.ts
packages/server/src/modules/InventoryCost/InventoryCostApplication.ts
packages/server/src/modules/InventoryCost/models/InventoryCostLotTracker.ts
packages/server/src/modules/InventoryCost/models/InventoryTransaction.ts
packages/server/src/modules/InventoryCost/models/InventoryTransactionMeta.ts
packages/server/src/modules/InventoryCost/processors/ComputeItemCost.processor.ts
packages/server/src/modules/InventoryCost/processors/WriteInventoryTransactionsGLEntries.processor.ts
packages/server/src/modules/InventoryCost/queries/GetItemsInventoryValuationList.service.ts
packages/server/src/modules/InventoryCost/subscribers/InventoryCost.subscriber.ts
packages/server/src/modules/InventoryCost/subscribers/InventoryCostGLBeforeWriteSubscriber.ts
packages/server/src/modules/InventoryCost/types/InventoryCost.types.ts
packages/server/src/modules/InventoryCost/utils.ts
packages/server/src/modules/ItemCategories/BulkDeleteItemCategories.service.ts
packages/server/src/modules/ItemCategories/commands/CommandItemCategoryValidator.service.ts
packages/server/src/modules/ItemCategories/commands/CreateItemCategory.service.ts
packages/server/src/modules/ItemCategories/commands/DeleteItemCategory.service.ts
packages/server/src/modules/ItemCategories/commands/EditItemCategory.service.ts
packages/server/src/modules/ItemCategories/constants.ts
packages/server/src/modules/ItemCategories/dtos/GetItemCategoriesQuery.dto.ts
packages/server/src/modules/ItemCategories/dtos/ItemCategory.dto.ts
packages/server/src/modules/ItemCategories/dtos/ItemCategoryResponse.dto.ts
packages/server/src/modules/ItemCategories/ItemCategoriesExportable.ts
packages/server/src/modules/ItemCategories/ItemCategoriesImportable.ts
packages/server/src/modules/ItemCategories/ItemCategory.application.ts
packages/server/src/modules/ItemCategories/ItemCategory.controller.ts
packages/server/src/modules/ItemCategories/ItemCategory.interfaces.ts
packages/server/src/modules/ItemCategories/ItemCategory.module.ts
packages/server/src/modules/ItemCategories/models/ItemCategory.meta.ts
packages/server/src/modules/ItemCategories/models/ItemCategory.model.ts
packages/server/src/modules/ItemCategories/queries/GetItemCategories.service.ts
packages/server/src/modules/ItemCategories/queries/GetItemCategory.service.ts
packages/server/src/modules/ItemCategories/ValidateBulkDeleteItemCategories.service.ts
packages/server/src/modules/Items/ActivateItem.service.ts
packages/server/src/modules/Items/BulkDeleteItems.service.ts
packages/server/src/modules/Items/CreateItem.service.ts
packages/server/src/modules/Items/DeleteItem.service.ts
packages/server/src/modules/Items/dtos/BulkDeleteItems.dto.ts
packages/server/src/modules/Items/dtos/GetItemsQuery.dto.ts
packages/server/src/modules/Items/dtos/Item.dto.ts
packages/server/src/modules/Items/dtos/ItemBillsResponse.dto.ts
packages/server/src/modules/Items/dtos/ItemErrorResponse.dto.ts
packages/server/src/modules/Items/dtos/ItemEstimatesResponse.dto.ts
packages/server/src/modules/Items/dtos/ItemInvoiceResponse.dto.ts
packages/server/src/modules/Items/dtos/ItemReceiptsResponse.dto.ts
packages/server/src/modules/Items/dtos/itemResponse.dto.ts
packages/server/src/modules/Items/EditItem.service.ts
packages/server/src/modules/Items/events/ItemCreated.event.ts
packages/server/src/modules/Items/GetItem.service.ts
packages/server/src/modules/Items/GetItems.service.ts
packages/server/src/modules/Items/InactivateItem.service.ts
packages/server/src/modules/Items/Item.controller.ts
packages/server/src/modules/Items/Item.schema.ts
packages/server/src/modules/Items/Item.transformer.ts
packages/server/src/modules/Items/ItemBillsTransactions.transformer.ts
packages/server/src/modules/Items/ItemEstimatesTransaction.transformer.ts
packages/server/src/modules/Items/ItemInvoicesTransactions.transformer.ts
packages/server/src/modules/Items/ItemReceiptsTransactions.transformer.ts
packages/server/src/modules/Items/Items.constants.ts
packages/server/src/modules/Items/Items.module.ts
packages/server/src/modules/Items/ItemsApplication.service.ts
packages/server/src/modules/Items/ItemsEntries.service.ts
packages/server/src/modules/Items/ItemsExportable.service.ts
packages/server/src/modules/Items/ItemsImportable.service.ts
packages/server/src/modules/Items/ItemTransactions.service.ts
packages/server/src/modules/Items/ItemValidator.service.ts
packages/server/src/modules/Items/listeners/ItemCreated.listener.ts
packages/server/src/modules/Items/models/Item.meta.ts
packages/server/src/modules/Items/models/Item.ts
packages/server/src/modules/Items/ServiceError.ts
packages/server/src/modules/Items/types/Items.types.ts
packages/server/src/modules/Items/ValidateBulkDeleteItems.service.ts
packages/server/src/modules/Ledger/JournalEntry.ts
packages/server/src/modules/Ledger/Ledger.module.ts
packages/server/src/modules/Ledger/Ledger.ts
packages/server/src/modules/Ledger/LedgerContactStorage.service.ts
packages/server/src/modules/Ledger/LedgerEntriesStorage.service.ts
packages/server/src/modules/Ledger/LedgerStorage.service.ts
packages/server/src/modules/Ledger/LedgerStorageRevert.service.ts
packages/server/src/modules/Ledger/LedgetAccountStorage.service.ts
packages/server/src/modules/Ledger/types/Ledger.types.ts
packages/server/src/modules/Ledger/utils.ts
packages/server/src/modules/Loops/Loops.module.ts
packages/server/src/modules/Loops/LoopsEvents.subscriber.ts
packages/server/src/modules/Mail/Mail.constants.ts
packages/server/src/modules/Mail/Mail.module.ts
packages/server/src/modules/Mail/Mail.ts
packages/server/src/modules/Mail/Mail.types.ts
packages/server/src/modules/Mail/MailTransporter.service.ts
packages/server/src/modules/MailNotification/constants.ts
packages/server/src/modules/MailNotification/ContactMailNotification.ts
packages/server/src/modules/MailNotification/dtos/CommonMailOptions.dto.ts
packages/server/src/modules/MailNotification/MailNotification.module.ts
packages/server/src/modules/MailNotification/MailNotification.types.ts
packages/server/src/modules/MailNotification/utils.ts
packages/server/src/modules/MailTenancy/MailTenancy.module.ts
packages/server/src/modules/MailTenancy/MailTenancy.service.ts
packages/server/src/modules/ManualJournals/BulkDeleteManualJournals.service.ts
packages/server/src/modules/ManualJournals/commands/AutoIncrementManualJournal.service.ts
packages/server/src/modules/ManualJournals/commands/CommandManualJournalValidators.service.ts
packages/server/src/modules/ManualJournals/commands/CreateManualJournal.service.ts
packages/server/src/modules/ManualJournals/commands/DeleteManualJournal.service.ts
packages/server/src/modules/ManualJournals/commands/EditManualJournal.service.ts
packages/server/src/modules/ManualJournals/commands/ManualJournalExportable.ts
packages/server/src/modules/ManualJournals/commands/ManualJournalGL.ts
packages/server/src/modules/ManualJournals/commands/ManualJournalGLEntries.ts
packages/server/src/modules/ManualJournals/commands/ManualJournalGLEntriesSubscriber.ts
packages/server/src/modules/ManualJournals/commands/ManualJournalsImport.ts
packages/server/src/modules/ManualJournals/commands/PublishManualJournal.service.ts
packages/server/src/modules/ManualJournals/constants.ts
packages/server/src/modules/ManualJournals/dtos/GetManualJournalsQuery.dto.ts
packages/server/src/modules/ManualJournals/dtos/ManualJournal.dto.ts
packages/server/src/modules/ManualJournals/dtos/ManualJournalResponse.dto.ts
packages/server/src/modules/ManualJournals/ManualJournals.controller.ts
packages/server/src/modules/ManualJournals/ManualJournals.module.ts
packages/server/src/modules/ManualJournals/ManualJournalsApplication.service.ts
packages/server/src/modules/ManualJournals/models/ManualJournal.meta.ts
packages/server/src/modules/ManualJournals/models/ManualJournal.ts
packages/server/src/modules/ManualJournals/models/ManualJournalEntry.ts
packages/server/src/modules/ManualJournals/queries/GetManualJournal.service.ts
packages/server/src/modules/ManualJournals/queries/GetManualJournals.service.ts
packages/server/src/modules/ManualJournals/queries/ManualJournalTransformer.ts
packages/server/src/modules/ManualJournals/types/ManualJournals.types.ts
packages/server/src/modules/ManualJournals/ValidateBulkDeleteManualJournals.service.ts
packages/server/src/modules/Metable/MetableConfig.ts
packages/server/src/modules/Metable/MetableModel.ts
packages/server/src/modules/Metable/MetableStore.ts
packages/server/src/modules/Metable/MetableStoreDB.ts
packages/server/src/modules/Metable/types.ts
packages/server/src/modules/Miscellaneous/dtos/DateFormatResponse.dto.ts
packages/server/src/modules/Miscellaneous/Miscellaneous.constants.ts
packages/server/src/modules/Miscellaneous/Miscellaneous.controller.ts
packages/server/src/modules/Miscellaneous/Miscellaneous.module.ts
packages/server/src/modules/Miscellaneous/queries/GetDateFormats.service.ts
packages/server/src/modules/Organization/commands/BuildOrganization.service.ts
packages/server/src/modules/Organization/commands/CommandOrganizationValidators.service.ts
packages/server/src/modules/Organization/commands/GetBuildOrganizationJob.service.ts
packages/server/src/modules/Organization/commands/SyncSystemUserToTenant.service.ts
packages/server/src/modules/Organization/commands/UpdateOrganization.service.ts
packages/server/src/modules/Organization/dtos/GetCurrentOrganizationResponse.dto.ts
packages/server/src/modules/Organization/dtos/Organization.dto.ts
packages/server/src/modules/Organization/dtos/OrganizationBuildJobResponse.dto.ts
packages/server/src/modules/Organization/Organization.constants.ts
packages/server/src/modules/Organization/Organization.controller.ts
packages/server/src/modules/Organization/Organization.module.ts
packages/server/src/modules/Organization/Organization.swagger.ts
packages/server/src/modules/Organization/Organization.types.ts
packages/server/src/modules/Organization/Organization.utils.ts
packages/server/src/modules/Organization/Organization/_utils.ts
packages/server/src/modules/Organization/Organization/constants.ts
packages/server/src/modules/Organization/Organization/OrganizationBaseCurrencyLocking.service.ts
packages/server/src/modules/Organization/processors/OrganizationBuild.processor.ts
packages/server/src/modules/Organization/queries/GetCurrentOrganization.service.ts
packages/server/src/modules/Organization/queries/GetCurrentOrganization.transformer.ts
packages/server/src/modules/Organization/queries/GetCurrentOrganizationMetadata.transformer.ts
packages/server/src/modules/Organization/queries/GetOrganizationBaseCurrencyLock.service.ts
packages/server/src/modules/Organization/subscribers/SyncSystemUserToTenant.subscriber.ts
packages/server/src/modules/PaymentLinks/CreateInvoiceCheckoutSession.ts
packages/server/src/modules/PaymentLinks/dtos/CreateStripeCheckoutSessionResponse.dto.ts
packages/server/src/modules/PaymentLinks/dtos/GetInvoicePaymentLinkResponse.dto.ts
packages/server/src/modules/PaymentLinks/GetInvoicePaymentLinkMetadata.ts
packages/server/src/modules/PaymentLinks/GetPaymentLinkInvoicePdf.ts
packages/server/src/modules/PaymentLinks/models/PaymentLink.ts
packages/server/src/modules/PaymentLinks/PaymentLinks.controller.ts
packages/server/src/modules/PaymentLinks/PaymentLinks.module.ts
packages/server/src/modules/PaymentLinks/PaymentLinksApplication.ts
packages/server/src/modules/PaymentReceived/BulkDeletePaymentReceived.service.ts
packages/server/src/modules/PaymentReceived/commands/CreatePaymentReceived.serivce.ts
packages/server/src/modules/PaymentReceived/commands/DeletePaymentReceived.service.ts
packages/server/src/modules/PaymentReceived/commands/EditPaymentReceived.service.ts
packages/server/src/modules/PaymentReceived/commands/PaymentReceivedDTOTransformer.ts
packages/server/src/modules/PaymentReceived/commands/PaymentReceivedGL.ts
packages/server/src/modules/PaymentReceived/commands/PaymentReceivedGLEntries.ts
packages/server/src/modules/PaymentReceived/commands/PaymentReceivedIncrement.service.ts
packages/server/src/modules/PaymentReceived/commands/PaymentReceivedInvoiceSync.service.ts
packages/server/src/modules/PaymentReceived/commands/PaymentReceivedMailNotification.ts
packages/server/src/modules/PaymentReceived/commands/PaymentReceivedMailNotificationJob.ts
packages/server/src/modules/PaymentReceived/commands/PaymentReceivedSmsNotify.ts
packages/server/src/modules/PaymentReceived/commands/PaymentReceivedValidators.service.ts
packages/server/src/modules/PaymentReceived/commands/PaymentsReceivedExportable.ts
packages/server/src/modules/PaymentReceived/commands/PaymentsReceivedImportable.ts
packages/server/src/modules/PaymentReceived/constants.ts
packages/server/src/modules/PaymentReceived/dtos/GetPaymentsReceivedQuery.dto.ts
packages/server/src/modules/PaymentReceived/dtos/PaymentReceived.dto.ts
packages/server/src/modules/PaymentReceived/dtos/PaymentReceivedResponse.dto.ts
packages/server/src/modules/PaymentReceived/dtos/PaymentReceivedStateResponse.dto.ts
packages/server/src/modules/PaymentReceived/models/PaymentReceived.meta.ts
packages/server/src/modules/PaymentReceived/models/PaymentReceived.ts
packages/server/src/modules/PaymentReceived/models/PaymentReceivedEntry.ts
packages/server/src/modules/PaymentReceived/PaymentReceived.application.ts
packages/server/src/modules/PaymentReceived/PaymentsReceived.controller.ts
packages/server/src/modules/PaymentReceived/PaymentsReceived.module.ts
packages/server/src/modules/PaymentReceived/processors/PaymentReceivedMailNotification.processor.ts
packages/server/src/modules/PaymentReceived/queries/GetPaymentReceived.service.ts
packages/server/src/modules/PaymentReceived/queries/GetPaymentReceivedInvoices.service.ts
packages/server/src/modules/PaymentReceived/queries/GetPaymentReceivedMailState.service.ts
packages/server/src/modules/PaymentReceived/queries/GetPaymentReceivedMailState.transformer.ts
packages/server/src/modules/PaymentReceived/queries/GetPaymentReceivedMailTemplate.service.ts
packages/server/src/modules/PaymentReceived/queries/GetPaymentReceivedMailTemplateAttrs.transformer.ts
packages/server/src/modules/PaymentReceived/queries/GetPaymentReceivedPdf.service.ts
packages/server/src/modules/PaymentReceived/queries/GetPaymentReceivedState.service.ts
packages/server/src/modules/PaymentReceived/queries/GetPaymentsReceived.service.ts
packages/server/src/modules/PaymentReceived/queries/PaymentReceivedBrandingTemplate.service.ts
packages/server/src/modules/PaymentReceived/queries/PaymentReceivedEntryTransformer.ts
packages/server/src/modules/PaymentReceived/queries/PaymentReceivedTransformer.ts
packages/server/src/modules/PaymentReceived/queries/PaymentsReceivedPages.service.ts
packages/server/src/modules/PaymentReceived/subscribers/PaymentReceivedAutoIncrementSubscriber.ts
packages/server/src/modules/PaymentReceived/subscribers/PaymentReceivedGLEntriesSubscriber.ts
packages/server/src/modules/PaymentReceived/subscribers/PaymentReceivedSmsNotificationSubscriber.ts
packages/server/src/modules/PaymentReceived/subscribers/PaymentReceivedSmsSubscriber.ts
packages/server/src/modules/PaymentReceived/subscribers/PaymentReceivedSyncInvoices.ts
packages/server/src/modules/PaymentReceived/types/PaymentReceived.types.ts
packages/server/src/modules/PaymentReceived/utils.ts
packages/server/src/modules/PaymentReceived/ValidateBulkDeletePaymentReceived.service.ts
packages/server/src/modules/PaymentServices/commands/DeletePaymentMethodService.ts
packages/server/src/modules/PaymentServices/commands/EditPaymentMethodService.ts
packages/server/src/modules/PaymentServices/models/PaymentIntegration.model.ts
packages/server/src/modules/PaymentServices/models/TransactionPaymentServiceEntry.model.ts
packages/server/src/modules/PaymentServices/PaymentServices.controller.ts
packages/server/src/modules/PaymentServices/PaymentServices.module.ts
packages/server/src/modules/PaymentServices/PaymentServicesApplication.ts
packages/server/src/modules/PaymentServices/queries/GetPaymentMethodsState.ts
packages/server/src/modules/PaymentServices/queries/GetPaymentService.ts
packages/server/src/modules/PaymentServices/queries/GetPaymentServicesSpecificInvoice.ts
packages/server/src/modules/PaymentServices/queries/GetPaymentServicesSpecificInvoiceTransformer.ts
packages/server/src/modules/PaymentServices/types.ts
packages/server/src/modules/PaymentServices/utils.ts
packages/server/src/modules/PdfTemplate/BrandingTemplateDTOTransformer.ts
packages/server/src/modules/PdfTemplate/commands/AssignPdfTemplateDefault.service.ts
packages/server/src/modules/PdfTemplate/commands/CreatePdfTemplate.service.ts
packages/server/src/modules/PdfTemplate/commands/DeletePdfTemplate.service.ts
packages/server/src/modules/PdfTemplate/commands/EditPdfTemplate.service.ts
packages/server/src/modules/PdfTemplate/dtos/PdfTemplate.dto.ts
packages/server/src/modules/PdfTemplate/GetPdfTemplateBrandingState.ts
packages/server/src/modules/PdfTemplate/models/PdfTemplate.ts
packages/server/src/modules/PdfTemplate/PdfTemplate.application.ts
packages/server/src/modules/PdfTemplate/PdfTemplates.controller.ts
packages/server/src/modules/PdfTemplate/PdfTemplates.module.ts
packages/server/src/modules/PdfTemplate/queries/GetOrganizationBrandingAttributes.service.ts
packages/server/src/modules/PdfTemplate/queries/GetPdfTemplate.service.ts
packages/server/src/modules/PdfTemplate/queries/GetPdfTemplate.transformer.ts
packages/server/src/modules/PdfTemplate/queries/GetPdfTemplateBrandingState.service.ts
packages/server/src/modules/PdfTemplate/queries/GetPdfTemplates.service.ts
packages/server/src/modules/PdfTemplate/queries/GetPdfTemplates.transformer.ts
packages/server/src/modules/PdfTemplate/types.ts
packages/server/src/modules/Plaid/Plaid.module.ts
packages/server/src/modules/Resource/_utils.ts
packages/server/src/modules/Resource/dtos/ResourceMetaResponse.dto.ts
packages/server/src/modules/Resource/models/ResourcableModel.ts
packages/server/src/modules/Resource/Resource.controller.ts
packages/server/src/modules/Resource/Resource.module.ts
packages/server/src/modules/Resource/ResourceService.ts
packages/server/src/modules/Roles/AbilitySchema.ts
packages/server/src/modules/Roles/Authorization.guard.ts
packages/server/src/modules/Roles/commands/CreateRole.service.ts
packages/server/src/modules/Roles/commands/DeleteRole.service.ts
packages/server/src/modules/Roles/commands/EditRole.service.ts
packages/server/src/modules/Roles/constants.ts
packages/server/src/modules/Roles/dtos/Role.dto.ts
packages/server/src/modules/Roles/dtos/RoleResponse.dto.ts
packages/server/src/modules/Roles/models/Role.model.ts
packages/server/src/modules/Roles/models/RolePermission.model.ts
packages/server/src/modules/Roles/Permission.guard.ts
packages/server/src/modules/Roles/queries/GetRole.service.ts
packages/server/src/modules/Roles/queries/GetRoles.service.ts
packages/server/src/modules/Roles/queries/RolePermissionsSchema.ts
packages/server/src/modules/Roles/queries/RoleTransformer.ts
packages/server/src/modules/Roles/RequirePermission.decorator.ts
packages/server/src/modules/Roles/Roles.application.ts
packages/server/src/modules/Roles/Roles.controller.ts
packages/server/src/modules/Roles/Roles.module.ts
packages/server/src/modules/Roles/Roles.types.ts
packages/server/src/modules/Roles/Roles.utils.ts
packages/server/src/modules/Roles/TenantAbilities.ts
packages/server/src/modules/Roles/utils.ts
packages/server/src/modules/S3/S3.module.ts
packages/server/src/modules/SaleEstimates/BulkDeleteSaleEstimates.service.ts
packages/server/src/modules/SaleEstimates/commands/ApproveSaleEstimate.service.ts
packages/server/src/modules/SaleEstimates/commands/ConvetSaleEstimate.service.ts
packages/server/src/modules/SaleEstimates/commands/CreateSaleEstimate.service.ts
packages/server/src/modules/SaleEstimates/commands/DeleteSaleEstimate.service.ts
packages/server/src/modules/SaleEstimates/commands/DeliverSaleEstimate.service.ts
packages/server/src/modules/SaleEstimates/commands/EditSaleEstimate.service.ts
packages/server/src/modules/SaleEstimates/commands/RejectSaleEstimate.service.ts
packages/server/src/modules/SaleEstimates/commands/SaleEstimateDTOTransformer.service.ts
packages/server/src/modules/SaleEstimates/commands/SaleEstimateIncrement.service.ts
packages/server/src/modules/SaleEstimates/commands/SaleEstimateSmsNotify.ts
packages/server/src/modules/SaleEstimates/commands/SaleEstimateValidators.service.ts
packages/server/src/modules/SaleEstimates/commands/SendSaleEstimateMail.ts
packages/server/src/modules/SaleEstimates/commands/SendSaleEstimateMailJob.ts
packages/server/src/modules/SaleEstimates/commands/UnlinkConvertedSaleEstimate.service.ts
packages/server/src/modules/SaleEstimates/constants.ts
packages/server/src/modules/SaleEstimates/dtos/GetSaleEstimatesQuery.dto.ts
packages/server/src/modules/SaleEstimates/dtos/SaleEstimate.dto.ts
packages/server/src/modules/SaleEstimates/dtos/SaleEstimateResponse.dto.ts
packages/server/src/modules/SaleEstimates/dtos/SaleEstimateStateResponse.dto.ts
packages/server/src/modules/SaleEstimates/models/SaleEstimate.meta.ts
packages/server/src/modules/SaleEstimates/models/SaleEstimate.ts
packages/server/src/modules/SaleEstimates/processes/SendSaleEstimateMail.process.ts
packages/server/src/modules/SaleEstimates/queries/GetEstimateMailTemplateAttributes.transformer.ts
packages/server/src/modules/SaleEstimates/queries/GetSaleEstimate.service.ts
packages/server/src/modules/SaleEstimates/queries/GetSaleEstimateMailState.service.ts
packages/server/src/modules/SaleEstimates/queries/GetSaleEstimateMailState.transformer.ts
packages/server/src/modules/SaleEstimates/queries/GetSaleEstimateMailTemplate.service.ts
packages/server/src/modules/SaleEstimates/queries/GetSaleEstimatePdf.ts
packages/server/src/modules/SaleEstimates/queries/GetSaleEstimates.service.ts
packages/server/src/modules/SaleEstimates/queries/GetSaleEstimateState.service.ts
packages/server/src/modules/SaleEstimates/queries/SaleEstimate.transformer.ts
packages/server/src/modules/SaleEstimates/SaleEstimates.application.ts
packages/server/src/modules/SaleEstimates/SaleEstimates.controller.ts
packages/server/src/modules/SaleEstimates/SaleEstimates.module.ts
packages/server/src/modules/SaleEstimates/SaleEstimatesExportable.ts
packages/server/src/modules/SaleEstimates/SaleEstimatesImportable.ts
packages/server/src/modules/SaleEstimates/subscribers/SaleEstimateAutoIncrementSubscriber.ts
packages/server/src/modules/SaleEstimates/subscribers/SaleEstimateMarkApprovedOnMailSent.ts
packages/server/src/modules/SaleEstimates/types/SaleEstimates.types.ts
packages/server/src/modules/SaleEstimates/utils.ts
packages/server/src/modules/SaleEstimates/ValidateBulkDeleteSaleEstimates.service.ts
packages/server/src/modules/SaleInvoices/BulkDeleteSaleInvoices.service.ts
packages/server/src/modules/SaleInvoices/commands/CommandSaleInvoiceDTOTransformer.service.ts
packages/server/src/modules/SaleInvoices/commands/CommandSaleInvoiceValidators.service.ts
packages/server/src/modules/SaleInvoices/commands/CreateSaleInvoice.service.ts
packages/server/src/modules/SaleInvoices/commands/DeleteSaleInvoice.service.ts
packages/server/src/modules/SaleInvoices/commands/DeliverSaleInvoice.service.ts
packages/server/src/modules/SaleInvoices/commands/EditSaleInvoice.service.ts
packages/server/src/modules/SaleInvoices/commands/GenerateInvoicePaymentLink.service.ts
packages/server/src/modules/SaleInvoices/commands/GeneratePaymentLink.transformer.ts
packages/server/src/modules/SaleInvoices/commands/inventory/InvoiceInventoryTransactions.ts
packages/server/src/modules/SaleInvoices/commands/SaleInvoiceIncrement.service.ts
packages/server/src/modules/SaleInvoices/commands/SaleInvoicesExportable.ts
packages/server/src/modules/SaleInvoices/commands/SaleInvoicesImportable.ts
packages/server/src/modules/SaleInvoices/commands/SendInvoiceInvoiceMailCommon.service.ts
packages/server/src/modules/SaleInvoices/commands/SendSaleInvoiceMail.ts
packages/server/src/modules/SaleInvoices/commands/SendSaleInvoiceMailJob.ts
packages/server/src/modules/SaleInvoices/commands/SendSaleInvoiceMailReminderJob.ts
packages/server/src/modules/SaleInvoices/commands/writeoff/SaleInvoiceWriteoffGL.ts
packages/server/src/modules/SaleInvoices/commands/writeoff/SaleInvoiceWriteoffGLStorage.ts
packages/server/src/modules/SaleInvoices/commands/WriteoffSaleInvoice.service.ts
packages/server/src/modules/SaleInvoices/constants.ts
packages/server/src/modules/SaleInvoices/dtos/GenerateSaleInvoiceSharableLinkResponse.dto.ts
packages/server/src/modules/SaleInvoices/dtos/GetSaleInvoicesQuery.dto.ts
packages/server/src/modules/SaleInvoices/dtos/SaleInvoice.dto.ts
packages/server/src/modules/SaleInvoices/dtos/SaleInvoiceResponse.dto.ts
packages/server/src/modules/SaleInvoices/dtos/SaleInvoiceState.dto.ts
packages/server/src/modules/SaleInvoices/InvoiceInventoryTransactions.ts
packages/server/src/modules/SaleInvoices/InvoicePaymentsGLRewrite.ts
packages/server/src/modules/SaleInvoices/ledger/InvoiceGL.ts
packages/server/src/modules/SaleInvoices/ledger/InvoiceGLEntries.ts
packages/server/src/modules/SaleInvoices/models/SaleInvoice.meta.ts
packages/server/src/modules/SaleInvoices/models/SaleInvoice.ts
packages/server/src/modules/SaleInvoices/processors/SendSaleInvoiceMail.processor.ts
packages/server/src/modules/SaleInvoices/queries/GetInvoicePaymentLink.transformer.ts
packages/server/src/modules/SaleInvoices/queries/GetInvoicePaymentMail.service.ts
packages/server/src/modules/SaleInvoices/queries/GetInvoicePaymentMailAttributes.transformer.ts
packages/server/src/modules/SaleInvoices/queries/GetInvoicePayments.service.ts
packages/server/src/modules/SaleInvoices/queries/GetSaleInvoice.service.ts
packages/server/src/modules/SaleInvoices/queries/GetSaleInvoiceMailReminder.ts
packages/server/src/modules/SaleInvoices/queries/GetSaleInvoiceMailState.service.ts
packages/server/src/modules/SaleInvoices/queries/GetSaleInvoiceMailState.transformer.ts
packages/server/src/modules/SaleInvoices/queries/GetSaleInvoices.ts
packages/server/src/modules/SaleInvoices/queries/GetSaleInvoicesPayable.service.ts
packages/server/src/modules/SaleInvoices/queries/GetSaleInvoiceState.service.ts
packages/server/src/modules/SaleInvoices/queries/InvoicePaymentTransaction.transformer.ts
packages/server/src/modules/SaleInvoices/queries/SaleEstimatePdfTemplate.service.ts
packages/server/src/modules/SaleInvoices/queries/SaleInvoice.transformer.ts
packages/server/src/modules/SaleInvoices/queries/SaleInvoicePdf.service.ts
packages/server/src/modules/SaleInvoices/queries/SaleInvoicePdfTemplate.service.ts
packages/server/src/modules/SaleInvoices/queries/SaleInvoiceTaxEntry.transformer.ts
packages/server/src/modules/SaleInvoices/SaleInvoice.types.ts
packages/server/src/modules/SaleInvoices/SaleInvoiceCostGLEntries.ts
packages/server/src/modules/SaleInvoices/SaleInvoiceNotifyBySms.ts
packages/server/src/modules/SaleInvoices/SaleInvoices.application.ts
packages/server/src/modules/SaleInvoices/SaleInvoices.controller.ts
packages/server/src/modules/SaleInvoices/SaleInvoices.module.ts
packages/server/src/modules/SaleInvoices/SalesInvoicesCost.ts
packages/server/src/modules/SaleInvoices/subscribers/InvoiceChangeStatusOnMailSentSubscriber.ts
packages/server/src/modules/SaleInvoices/subscribers/InvoiceCostGLEntriesSubscriber.ts
packages/server/src/modules/SaleInvoices/subscribers/InvoiceGLEntriesSubscriber.ts
packages/server/src/modules/SaleInvoices/subscribers/InvoicePaymentGLRewriteSubscriber.ts
packages/server/src/modules/SaleInvoices/subscribers/InvoicePaymentIntegrationSubscriber.ts
packages/server/src/modules/SaleInvoices/subscribers/InvoiceWriteInventoryTransactions.ts
packages/server/src/modules/SaleInvoices/subscribers/SaleInvoiceAutoIncrementSubscriber.ts
packages/server/src/modules/SaleInvoices/subscribers/SaleInvoiceWriteoffSubscriber.ts
packages/server/src/modules/SaleInvoices/utils.ts
packages/server/src/modules/SaleInvoices/ValidateBulkDeleteSaleInvoices.service.ts
packages/server/src/modules/SaleReceipts/BulkDeleteSaleReceipts.service.ts
packages/server/src/modules/SaleReceipts/commands/CloseSaleReceipt.service.ts
packages/server/src/modules/SaleReceipts/commands/CreateSaleReceipt.service.ts
packages/server/src/modules/SaleReceipts/commands/DeleteSaleReceipt.service.ts
packages/server/src/modules/SaleReceipts/commands/EditSaleReceipt.service.ts
packages/server/src/modules/SaleReceipts/commands/SaleReceiptDTOTransformer.service.ts
packages/server/src/modules/SaleReceipts/commands/SaleReceiptIncrement.service.ts
packages/server/src/modules/SaleReceipts/commands/SaleReceiptInventoryTransactions.ts
packages/server/src/modules/SaleReceipts/commands/SaleReceiptMailNotification.ts
packages/server/src/modules/SaleReceipts/commands/SaleReceiptMailNotificationJob.ts
packages/server/src/modules/SaleReceipts/commands/SaleReceiptNotifyBySms.ts
packages/server/src/modules/SaleReceipts/commands/SaleReceiptsExportable.ts
packages/server/src/modules/SaleReceipts/commands/SaleReceiptsImportable.ts
packages/server/src/modules/SaleReceipts/commands/SaleReceiptValidators.service.ts
packages/server/src/modules/SaleReceipts/constants.ts
packages/server/src/modules/SaleReceipts/dtos/GetSaleReceiptsQuery.dto.ts
packages/server/src/modules/SaleReceipts/dtos/SaleReceipt.dto.ts
packages/server/src/modules/SaleReceipts/dtos/SaleReceiptResponse.dto.ts
packages/server/src/modules/SaleReceipts/dtos/SaleReceiptState.dto.ts
packages/server/src/modules/SaleReceipts/inventory/SaleReceiptInventoryTransactions.ts
packages/server/src/modules/SaleReceipts/inventory/SaleReceiptWriteInventoryTransactions.ts
packages/server/src/modules/SaleReceipts/ledger/SaleReceiptGL.ts
packages/server/src/modules/SaleReceipts/ledger/SaleReceiptGLEntries.ts
packages/server/src/modules/SaleReceipts/models/SaleReceipt.meta.ts
packages/server/src/modules/SaleReceipts/models/SaleReceipt.ts
packages/server/src/modules/SaleReceipts/processes/SendSaleReceiptMail.process.ts
packages/server/src/modules/SaleReceipts/queries/GetSaleReceipt.service.ts
packages/server/src/modules/SaleReceipts/queries/GetSaleReceiptMailState.service.ts
packages/server/src/modules/SaleReceipts/queries/GetSaleReceiptMailState.transformer.ts
packages/server/src/modules/SaleReceipts/queries/GetSaleReceiptMailTemplate.service.ts
packages/server/src/modules/SaleReceipts/queries/GetSaleReceiptMailTemplate.transformer.ts
packages/server/src/modules/SaleReceipts/queries/GetSaleReceipts.service.ts
packages/server/src/modules/SaleReceipts/queries/GetSaleReceiptState.service.ts
packages/server/src/modules/SaleReceipts/queries/SaleReceiptBrandingTemplate.service.ts
packages/server/src/modules/SaleReceipts/queries/SaleReceiptsPdf.service.ts
packages/server/src/modules/SaleReceipts/queries/SaleReceiptTransformer.ts
packages/server/src/modules/SaleReceipts/SaleReceiptApplication.service.ts
packages/server/src/modules/SaleReceipts/SaleReceiptCostGLEntries.ts
packages/server/src/modules/SaleReceipts/SaleReceipts.controller.ts
packages/server/src/modules/SaleReceipts/SaleReceipts.module.ts
packages/server/src/modules/SaleReceipts/subscribers/SaleReceiptAutoIncrementSubscriber.ts
packages/server/src/modules/SaleReceipts/subscribers/SaleReceiptCostGLEntriesSubscriber.ts
packages/server/src/modules/SaleReceipts/subscribers/SaleReceiptGLEntriesSubscriber.ts
packages/server/src/modules/SaleReceipts/subscribers/SaleReceiptMarkClosedOnMailSentSubcriber.ts
packages/server/src/modules/SaleReceipts/types/SaleReceipts.types.ts
packages/server/src/modules/SaleReceipts/utils.ts
packages/server/src/modules/SaleReceipts/ValidateBulkDeleteSaleReceipts.service.ts
packages/server/src/modules/Search/SearchableMdel.ts
packages/server/src/modules/Settings/commands/SaveSettings.service.ts
packages/server/src/modules/Settings/models/Setting.ts
packages/server/src/modules/Settings/ModelSettings.ts
packages/server/src/modules/Settings/queries/GetSettings.service.ts
packages/server/src/modules/Settings/repositories/Setting.repository.ts
packages/server/src/modules/Settings/Settings.controller.ts
packages/server/src/modules/Settings/Settings.module.ts
packages/server/src/modules/Settings/Settings.types.ts
packages/server/src/modules/Settings/SettingsApplication.service.ts
packages/server/src/modules/Settings/SettingsStore.ts
packages/server/src/modules/Socket/Socket.gateway.ts
packages/server/src/modules/Socket/Socket.module.ts
packages/server/src/modules/StripePayment/CreatePaymentReceivedStripePayment.ts
packages/server/src/modules/StripePayment/CreateStripeAccountLink.ts
packages/server/src/modules/StripePayment/CreateStripeAccountService.ts
packages/server/src/modules/StripePayment/dtos/CreateStripeAccountLinkBody.dto.ts
packages/server/src/modules/StripePayment/dtos/CreateStripeAccountLinkResponse.dto.ts
packages/server/src/modules/StripePayment/dtos/CreateStripeAccountResponse.dto.ts
packages/server/src/modules/StripePayment/dtos/CreateStripeAccountSessionBody.dto.ts
packages/server/src/modules/StripePayment/dtos/CreateStripeAccountSessionResponse.dto.ts
packages/server/src/modules/StripePayment/dtos/ExchangeStripeOAuthBody.dto.ts
packages/server/src/modules/StripePayment/dtos/GetStripeConnectLinkResponse.dto.ts
packages/server/src/modules/StripePayment/dtos/StripeAccountLinkResponse.dto.ts
packages/server/src/modules/StripePayment/ExchangeStripeOauthToken.ts
packages/server/src/modules/StripePayment/GetStripeAuthorizationLink.ts
packages/server/src/modules/StripePayment/models/PaymentIntegration.model.ts
packages/server/src/modules/StripePayment/StripePayment.controller.ts
packages/server/src/modules/StripePayment/StripePayment.module.ts
packages/server/src/modules/StripePayment/StripePayment.types.ts
packages/server/src/modules/StripePayment/StripePaymentApplication.ts
packages/server/src/modules/StripePayment/StripePaymentService.ts
packages/server/src/modules/StripePayment/StripePaymentWebhooks.controller.ts
packages/server/src/modules/StripePayment/subscribers/SeedStripeAccounts.ts
packages/server/src/modules/StripePayment/subscribers/StripeWebhooksSubscriber.ts
packages/server/src/modules/StripePayment/types.ts
packages/server/src/modules/Subscription/commands/CancelLemonSubscription.service.ts
packages/server/src/modules/Subscription/commands/ChangeLemonSubscription.service.ts
packages/server/src/modules/Subscription/commands/MarkSubscriptionCanceled.service.ts
packages/server/src/modules/Subscription/commands/MarkSubscriptionChanged.service.ts
packages/server/src/modules/Subscription/commands/MarkSubscriptionPaymentFailed.service.ts
packages/server/src/modules/Subscription/commands/MarkSubscriptionPaymentSuccessed.service.ts
packages/server/src/modules/Subscription/commands/MarkSubscriptionResumed.sevice.ts
packages/server/src/modules/Subscription/commands/NewSubscription.service.ts
packages/server/src/modules/Subscription/commands/ResumeLemonSubscription.service.ts
packages/server/src/modules/Subscription/exceptions/NotAllowedChangeSubscriptionPlan.ts
packages/server/src/modules/Subscription/interceptors/Subscription.guard.ts
packages/server/src/modules/Subscription/models/Plan.ts
packages/server/src/modules/Subscription/models/PlanSubscription.ts
packages/server/src/modules/Subscription/queries/GetLemonSqueezyCheckout.service.ts
packages/server/src/modules/Subscription/queries/GetSubscriptions.service.ts
packages/server/src/modules/Subscription/queries/GetSubscriptionsTransformer.ts
packages/server/src/modules/Subscription/repositories/PlanSubscription.repository.ts
packages/server/src/modules/Subscription/subscribers/SubscribeFreeOnSignupCommunity.ts
packages/server/src/modules/Subscription/subscribers/TriggerInvalidateCacheOnSubscriptionChange.ts
packages/server/src/modules/Subscription/Subscription.module.ts
packages/server/src/modules/Subscription/SubscriptionApplication.ts
packages/server/src/modules/Subscription/SubscriptionPeriod.ts
packages/server/src/modules/Subscription/Subscriptions.controller.ts
packages/server/src/modules/Subscription/SubscriptionsLemonWebhook.controller.ts
packages/server/src/modules/Subscription/types.ts
packages/server/src/modules/Subscription/utils.ts
packages/server/src/modules/Subscription/webhooks/LemonSqueezyWebhooks.ts
packages/server/src/modules/System/models/SystemModel.ts
packages/server/src/modules/System/models/SystemUser.ts
packages/server/src/modules/System/models/TenantBaseModel.ts
packages/server/src/modules/System/models/TenantMetadataModel.ts
packages/server/src/modules/System/models/TenantModel.ts
packages/server/src/modules/System/repositories/Tenant.repository.ts
packages/server/src/modules/System/SystemDB/Ping.controller.ts
packages/server/src/modules/System/SystemDB/SystemDB.constants.ts
packages/server/src/modules/System/SystemDB/SystemDB.controller.ts
packages/server/src/modules/System/SystemDB/SystemDB.module.ts
packages/server/src/modules/System/SystemModels/SystemModels.constants.ts
packages/server/src/modules/System/SystemModels/SystemModels.module.ts
packages/server/src/modules/TaxRates/commands/ActivateTaxRate.service.ts
packages/server/src/modules/TaxRates/commands/CommandTaxRatesValidator.service.ts
packages/server/src/modules/TaxRates/commands/CreateTaxRate.service.ts
packages/server/src/modules/TaxRates/commands/DeleteTaxRate.service.ts
packages/server/src/modules/TaxRates/commands/EditTaxRate.service.ts
packages/server/src/modules/TaxRates/commands/InactivateTaxRate.ts
packages/server/src/modules/TaxRates/constants.ts
packages/server/src/modules/TaxRates/dtos/TaxRate.dto.ts
packages/server/src/modules/TaxRates/dtos/TaxRateResponse.dto.ts
packages/server/src/modules/TaxRates/ItemEntriesTaxTransactions.service.ts
packages/server/src/modules/TaxRates/models/TaxRate.model.ts
packages/server/src/modules/TaxRates/models/TaxRateTransaction.model.ts
packages/server/src/modules/TaxRates/queries/GetTaxRate.service.ts
packages/server/src/modules/TaxRates/queries/GetTaxRates.service.ts
packages/server/src/modules/TaxRates/queries/TaxRate.transformer.ts
packages/server/src/modules/TaxRates/subscribers/BillTaxRateValidateSubscriber.ts
packages/server/src/modules/TaxRates/subscribers/SaleInvoiceTaxRateValidateSubscriber.ts
packages/server/src/modules/TaxRates/subscribers/SyncItemTaxRateOnEditTaxSubscriber.ts
packages/server/src/modules/TaxRates/subscribers/WriteBillTaxTransactionsSubscriber.ts
packages/server/src/modules/TaxRates/subscribers/WriteInvoiceTaxTransactionsSubscriber.ts
packages/server/src/modules/TaxRates/SyncItemTaxRateOnEditTaxRate.ts
packages/server/src/modules/TaxRates/TaxRate.application.ts
packages/server/src/modules/TaxRates/TaxRate.controller.ts
packages/server/src/modules/TaxRates/TaxRate.module.ts
packages/server/src/modules/TaxRates/TaxRates.types.ts
packages/server/src/modules/TaxRates/TaxRatesExportable.ts
packages/server/src/modules/TaxRates/TaxRatesImportable.SampleData.ts
packages/server/src/modules/TaxRates/TaxRatesImportable.ts
packages/server/src/modules/TaxRates/utils.ts
packages/server/src/modules/TaxRates/WriteTaxTransactionsItemEntries.ts
packages/server/src/modules/TemplateInjectable/TemplateInjectable.module.ts
packages/server/src/modules/TemplateInjectable/TemplateInjectable.service.ts
packages/server/src/modules/Tenancy/EnsureTenantIsInitialized.guard.ts
packages/server/src/modules/Tenancy/EnsureTenantIsSeeded.guards.ts
packages/server/src/modules/Tenancy/Tenancy.module.ts
packages/server/src/modules/Tenancy/TenancyCache/TenancyCache.module.ts
packages/server/src/modules/Tenancy/TenancyContext.service.ts
packages/server/src/modules/Tenancy/TenancyDB/TenancyDB.constants.ts
packages/server/src/modules/Tenancy/TenancyDB/TenancyDB.module.ts
packages/server/src/modules/Tenancy/TenancyDB/TransactionsHooks.ts
packages/server/src/modules/Tenancy/TenancyDB/UnitOfWork.service.ts
packages/server/src/modules/Tenancy/TenancyGlobal.guard.ts
packages/server/src/modules/Tenancy/TenancyInitializeModels.guard.ts
packages/server/src/modules/Tenancy/TenancyModels/decorators/InjectModelMeta.decorator.ts
packages/server/src/modules/Tenancy/TenancyModels/models/TenantUser.model.ts
packages/server/src/modules/Tenancy/TenancyModels/Tenancy.constants.ts
packages/server/src/modules/Tenancy/TenancyModels/Tenancy.module.ts
packages/server/src/modules/Tenancy/Tenant.controller.ts
packages/server/src/modules/Tenancy/TenantModelsInitialize.module.ts
packages/server/src/modules/TenantDBManager/_utils.ts
packages/server/src/modules/TenantDBManager/exceptions/TenantAlreadyInitialized.ts
packages/server/src/modules/TenantDBManager/exceptions/TenantAlreadySeeded.ts
packages/server/src/modules/TenantDBManager/exceptions/TenantDatabaseNotBuilt.ts
packages/server/src/modules/TenantDBManager/exceptions/TenantDBAlreadyExists.ts
packages/server/src/modules/TenantDBManager/TenantDBManager.module.ts
packages/server/src/modules/TenantDBManager/TenantDBManager.ts
packages/server/src/modules/TenantDBManager/TenantsManager.ts
packages/server/src/modules/TransactionItemEntry/dto/ItemEntry.dto.ts
packages/server/src/modules/TransactionItemEntry/ItemEntry.transformer.ts
packages/server/src/modules/TransactionItemEntry/ItemEntry.types.ts
packages/server/src/modules/TransactionItemEntry/models/ItemEntry.ts
packages/server/src/modules/TransactionsLocking/commands/CommandTransactionsLockingService.ts
packages/server/src/modules/TransactionsLocking/constants.ts
packages/server/src/modules/TransactionsLocking/dtos/TransactionLockingResponse.dto.ts
packages/server/src/modules/TransactionsLocking/dtos/TransactionsLocking.dto.ts
packages/server/src/modules/TransactionsLocking/guards/FinancialTransactionLockingGuard.ts
packages/server/src/modules/TransactionsLocking/guards/PurchasesTransactionLockingGuard.ts
packages/server/src/modules/TransactionsLocking/guards/SalesTransactionLockingGuard.ts
packages/server/src/modules/TransactionsLocking/guards/TransactionsLockingGuard.ts
packages/server/src/modules/TransactionsLocking/queries/QueryTransactionsLocking.ts
packages/server/src/modules/TransactionsLocking/queries/TransactionsLockingMetaTransformer.ts
packages/server/src/modules/TransactionsLocking/subscribers/FinancialsTransactionLockingGuardSubscriber.ts
packages/server/src/modules/TransactionsLocking/subscribers/PurchasesTransactionLockingGuardSubscriber.ts
packages/server/src/modules/TransactionsLocking/subscribers/SalesTransactionLockingGuardSubscriber.ts
packages/server/src/modules/TransactionsLocking/TransactionsLocking.controller.ts
packages/server/src/modules/TransactionsLocking/TransactionsLocking.module.ts
packages/server/src/modules/TransactionsLocking/TransactionsLockingRepository.ts
packages/server/src/modules/TransactionsLocking/types/TransactionsLocking.types.ts
packages/server/src/modules/Transformer/Transformer.module.ts
packages/server/src/modules/Transformer/Transformer.ts
packages/server/src/modules/Transformer/Transformer.types.ts
packages/server/src/modules/Transformer/TransformerInjectable.service.ts
packages/server/src/modules/UsersModule/commands/AcceptInviteUser.service.ts
packages/server/src/modules/UsersModule/commands/ActivateUser.service.ts
packages/server/src/modules/UsersModule/commands/DeleteUser.service.ts
packages/server/src/modules/UsersModule/commands/EditUser.service.ts
packages/server/src/modules/UsersModule/commands/InactivateUser.service.ts
packages/server/src/modules/UsersModule/commands/InviteUser.service.ts
packages/server/src/modules/UsersModule/commands/SendInviteUsersMailMessage.service.ts
packages/server/src/modules/UsersModule/dtos/EditUser.dto.ts
packages/server/src/modules/UsersModule/dtos/InviteUser.dto.ts
packages/server/src/modules/UsersModule/models/InviteUser.model.ts
packages/server/src/modules/UsersModule/processors/SendInviteUserMail.processor.ts
packages/server/src/modules/UsersModule/queries/GetUser.service.ts
packages/server/src/modules/UsersModule/queries/GetUsers.service.ts
packages/server/src/modules/UsersModule/queries/User.transformer.ts
packages/server/src/modules/UsersModule/subscribers/InviteSendMailNotification.subscriber.ts
packages/server/src/modules/UsersModule/subscribers/PurgeUserAbilityCache.subscriber.ts
packages/server/src/modules/UsersModule/subscribers/SyncSystemSendInvite.subscriber.ts
packages/server/src/modules/UsersModule/subscribers/SyncTenantAcceptInvite.subscriber.ts
packages/server/src/modules/UsersModule/subscribers/SyncTenantUserDeleted.subscriber.ts
packages/server/src/modules/UsersModule/subscribers/SyncTenantUserSaved.subscriber.ts
packages/server/src/modules/UsersModule/Users.application.ts
packages/server/src/modules/UsersModule/Users.constants.ts
packages/server/src/modules/UsersModule/Users.controller.ts
packages/server/src/modules/UsersModule/Users.module.ts
packages/server/src/modules/UsersModule/Users.types.ts
packages/server/src/modules/UsersModule/UsersInvite.controller.ts
packages/server/src/modules/UsersModule/UsersInvitePublic.controller.ts
packages/server/src/modules/VendorCredit/BulkDeleteVendorCredits.service.ts
packages/server/src/modules/VendorCredit/commands/CreateVendorCredit.service.ts
packages/server/src/modules/VendorCredit/commands/DeleteVendorCredit.service.ts
packages/server/src/modules/VendorCredit/commands/EditVendorCredit.service.ts
packages/server/src/modules/VendorCredit/commands/OpenVendorCredit.service.ts
packages/server/src/modules/VendorCredit/commands/VendorCreditAutoIncrement.service.ts
packages/server/src/modules/VendorCredit/commands/VendorCreditDTOTransform.service.ts
packages/server/src/modules/VendorCredit/commands/VendorCreditGL.ts
packages/server/src/modules/VendorCredit/commands/VendorCreditGLEntries.ts
packages/server/src/modules/VendorCredit/commands/VendorCreditInventoryTransactions.ts
packages/server/src/modules/VendorCredit/commands/VendorCreditsExportable.ts
packages/server/src/modules/VendorCredit/commands/VendorCreditsImportable.ts
packages/server/src/modules/VendorCredit/constants.ts
packages/server/src/modules/VendorCredit/dtos/GetVendorCreditsQuery.dto.ts
packages/server/src/modules/VendorCredit/dtos/VendorCredit.dto.ts
packages/server/src/modules/VendorCredit/models/VendorCredit.meta.ts
packages/server/src/modules/VendorCredit/models/VendorCredit.ts
packages/server/src/modules/VendorCredit/queries/GetVendorCredit.service.ts
packages/server/src/modules/VendorCredit/queries/GetVendorCredits.service.ts
packages/server/src/modules/VendorCredit/queries/VendorCreditTransformer.ts
packages/server/src/modules/VendorCredit/subscribers/DeleteVendorAssociatedVendorCredit.ts
packages/server/src/modules/VendorCredit/subscribers/RefundSyncVendorCreditBalanceSubscriber.ts
packages/server/src/modules/VendorCredit/subscribers/RefundVendorCreditGLEntriesSubscriber.ts
packages/server/src/modules/VendorCredit/subscribers/VendorCreditAutoSerialSubscriber.ts
packages/server/src/modules/VendorCredit/subscribers/VendorCreditGLEntriesSubscriber.ts
packages/server/src/modules/VendorCredit/subscribers/VendorCreditInventoryTransactionsSusbcriber.ts
packages/server/src/modules/VendorCredit/types/VendorCredit.types.ts
packages/server/src/modules/VendorCredit/ValidateBulkDeleteVendorCredits.service.ts
packages/server/src/modules/VendorCredit/VendorCredits.controller.ts
packages/server/src/modules/VendorCredit/VendorCredits.module.ts
packages/server/src/modules/VendorCredit/VendorCreditsApplication.service.ts
packages/server/src/modules/VendorCreditsApplyBills/command/ApplyVendorCreditSyncBills.service.ts
packages/server/src/modules/VendorCreditsApplyBills/command/ApplyVendorCreditSyncInvoiced.service.ts
packages/server/src/modules/VendorCreditsApplyBills/command/ApplyVendorCreditToBills.service.ts
packages/server/src/modules/VendorCreditsApplyBills/command/DeleteApplyVendorCreditToBill.service.ts
packages/server/src/modules/VendorCreditsApplyBills/dtos/ApplyVendorCreditToBills.dto.ts
packages/server/src/modules/VendorCreditsApplyBills/models/VendorCreditAppliedBill.ts
packages/server/src/modules/VendorCreditsApplyBills/queries/GetAppliedBillsToVendorCredit.service.ts
packages/server/src/modules/VendorCreditsApplyBills/queries/GetVendorCreditToApplyBills.service.ts
packages/server/src/modules/VendorCreditsApplyBills/queries/VendorCreditAppliedBillTransformer.ts
packages/server/src/modules/VendorCreditsApplyBills/queries/VendorCreditToApplyBillTransformer.ts
packages/server/src/modules/VendorCreditsApplyBills/subscribers/ApplyVendorCreditSyncBillsSubscriber.ts
packages/server/src/modules/VendorCreditsApplyBills/subscribers/ApplyVendorCreditSyncInvoicedSubscriber.ts
packages/server/src/modules/VendorCreditsApplyBills/types/VendorCreditApplyBills.types.ts
packages/server/src/modules/VendorCreditsApplyBills/VendorCreditApplyBills.controller.ts
packages/server/src/modules/VendorCreditsApplyBills/VendorCreditApplyBills.module.ts
packages/server/src/modules/VendorCreditsApplyBills/VendorCreditApplyBillsApplication.service.ts
packages/server/src/modules/VendorCreditsApplyBills/VendorCreditsApplyBills.constants.ts
packages/server/src/modules/VendorCreditsRefund/commands/CreateRefundVendorCredit.service.ts
packages/server/src/modules/VendorCreditsRefund/commands/DeleteRefundVendorCredit.service.ts
packages/server/src/modules/VendorCreditsRefund/commands/RefundSyncCreditRefundedAmount.service.ts
packages/server/src/modules/VendorCreditsRefund/commands/RefundSyncVendorCreditBalance.service.ts
packages/server/src/modules/VendorCreditsRefund/commands/RefundVendorCredit.service.ts
packages/server/src/modules/VendorCreditsRefund/commands/RefundVendorCreditGLEntries.ts
packages/server/src/modules/VendorCreditsRefund/commands/RefundVendorCreditTransformer.ts
packages/server/src/modules/VendorCreditsRefund/constants.ts
packages/server/src/modules/VendorCreditsRefund/dtos/RefundVendorCredit.dto.ts
packages/server/src/modules/VendorCreditsRefund/models/RefundVendorCredit.ts
packages/server/src/modules/VendorCreditsRefund/queries/GetRefundVendorCredit.service.ts
packages/server/src/modules/VendorCreditsRefund/queries/GetRefundVendorCredits.service.ts
packages/server/src/modules/VendorCreditsRefund/RefundCreditSyncBills.ts
packages/server/src/modules/VendorCreditsRefund/subscribers/RefundVendorCreditGLEntriesSubscriber.ts
packages/server/src/modules/VendorCreditsRefund/types/VendorCreditRefund.types.ts
packages/server/src/modules/VendorCreditsRefund/VendorCreditsRefund.application.ts
packages/server/src/modules/VendorCreditsRefund/VendorCreditsRefund.controller.ts
packages/server/src/modules/VendorCreditsRefund/VendorCreditsRefund.module.ts
packages/server/src/modules/Vendors/_SampleData.ts
packages/server/src/modules/Vendors/BulkDeleteVendors.service.ts
packages/server/src/modules/Vendors/commands/ActivateVendor.service.ts
packages/server/src/modules/Vendors/commands/CreateEditVendorDTO.ts
packages/server/src/modules/Vendors/commands/CreateVendor.service.ts
packages/server/src/modules/Vendors/commands/DeleteVendor.service.ts
packages/server/src/modules/Vendors/commands/EditOpeningBalanceVendor.service.ts
packages/server/src/modules/Vendors/commands/EditVendor.service.ts
packages/server/src/modules/Vendors/commands/VendorValidators.ts
packages/server/src/modules/Vendors/constants.ts
packages/server/src/modules/Vendors/dtos/BulkDeleteVendors.dto.ts
packages/server/src/modules/Vendors/dtos/CreateVendor.dto.ts
packages/server/src/modules/Vendors/dtos/EditVendor.dto.ts
packages/server/src/modules/Vendors/dtos/GetVendorsQuery.dto.ts
packages/server/src/modules/Vendors/dtos/VendorOpeningBalanceEdit.dto.ts
packages/server/src/modules/Vendors/models/Vendor.meta.ts
packages/server/src/modules/Vendors/models/Vendor.ts
packages/server/src/modules/Vendors/queries/GetVendor.ts
packages/server/src/modules/Vendors/queries/GetVendors.service.ts
packages/server/src/modules/Vendors/queries/VendorTransformer.ts
packages/server/src/modules/Vendors/subscribers/VendorGLEntriesSubscriber.ts
packages/server/src/modules/Vendors/types/Vendors.types.ts
packages/server/src/modules/Vendors/ValidateBulkDeleteVendors.service.ts
packages/server/src/modules/Vendors/VendorGLEntries.ts
packages/server/src/modules/Vendors/VendorGLEntriesStorage.ts
packages/server/src/modules/Vendors/Vendors.controller.ts
packages/server/src/modules/Vendors/Vendors.module.ts
packages/server/src/modules/Vendors/VendorsApplication.service.ts
packages/server/src/modules/Vendors/VendorsExportable.ts
packages/server/src/modules/Vendors/VendorsImportable.ts
packages/server/src/modules/Views/decorators/InjectModelDefaultViews.decorator.ts
packages/server/src/modules/Views/dtos/RoleResponse.dto.ts
packages/server/src/modules/Views/dtos/ViewResponse.dto.ts
packages/server/src/modules/Views/GetResourceColumns.service.ts
packages/server/src/modules/Views/GetResourceView.transformer.ts
packages/server/src/modules/Views/GetResourceViews.service.ts
packages/server/src/modules/Views/models/View.model.ts
packages/server/src/modules/Views/models/ViewColumn.model.ts
packages/server/src/modules/Views/models/ViewRole.model.ts
packages/server/src/modules/Views/Views.controller.ts
packages/server/src/modules/Views/Views.module.ts
packages/server/src/modules/Views/Views.types.ts
packages/server/src/modules/Warehouses/AccountsTransactionsWarehouses.ts
packages/server/src/modules/Warehouses/AccountsTransactionsWarehousesSubscribe.ts
packages/server/src/modules/Warehouses/Activate/BillWarehousesActivate.ts
packages/server/src/modules/Warehouses/Activate/CreditNoteWarehousesActivate.ts
packages/server/src/modules/Warehouses/Activate/EstimateWarehousesActivate.ts
packages/server/src/modules/Warehouses/Activate/InventoryTransactionsWarehousesActivate.ts
packages/server/src/modules/Warehouses/Activate/InvoiceWarehousesActivate.ts
packages/server/src/modules/Warehouses/Activate/ReceiptWarehousesActivate.ts
packages/server/src/modules/Warehouses/Activate/VendorCreditWarehousesActivate.ts
packages/server/src/modules/Warehouses/ActivateWarehousesSubscriber.ts
packages/server/src/modules/Warehouses/commands/ActivateWarehouses.service.ts
packages/server/src/modules/Warehouses/commands/CreateInitialWarehouse.service.ts
packages/server/src/modules/Warehouses/commands/CreateWarehouse.service.ts
packages/server/src/modules/Warehouses/commands/DeleteItemWarehousesQuantity.ts
packages/server/src/modules/Warehouses/commands/DeleteWarehouse.service.ts
packages/server/src/modules/Warehouses/commands/EditWarehouse.service.ts
packages/server/src/modules/Warehouses/commands/WarehouseMarkPrimary.service.ts
packages/server/src/modules/Warehouses/commands/WarehouseValidator.service.ts
packages/server/src/modules/Warehouses/contants.ts
packages/server/src/modules/Warehouses/CreateInitialWarehousesitemsQuantity.ts
packages/server/src/modules/Warehouses/CRUDWarehouse.ts
packages/server/src/modules/Warehouses/dtos/GetWarehouseTransfersQuery.dto.ts
packages/server/src/modules/Warehouses/dtos/Warehouse.dto.ts
packages/server/src/modules/Warehouses/dtos/WarehouseResponse.dto.ts
packages/server/src/modules/Warehouses/Integrations/constants.ts
packages/server/src/modules/Warehouses/Integrations/ValidateWarehouseExistance.ts
packages/server/src/modules/Warehouses/Integrations/WarehousesDTOValidators.ts
packages/server/src/modules/Warehouses/Integrations/WarehousesItemsQuantity.ts
packages/server/src/modules/Warehouses/Integrations/WarehousesItemsQuantitySync.ts
packages/server/src/modules/Warehouses/Integrations/WarehousesItemsQuantitySynSubscriber.ts
packages/server/src/modules/Warehouses/Integrations/WarehouseTransactionDTOTransform.ts
packages/server/src/modules/Warehouses/Items/GetItemWarehouses.ts
packages/server/src/modules/Warehouses/Items/GettItemWarehouseTransformer.ts
packages/server/src/modules/Warehouses/models/ItemWarehouseQuantity.ts
packages/server/src/modules/Warehouses/models/Warehouse.model.ts
packages/server/src/modules/Warehouses/queries/GetWarehouse.ts
packages/server/src/modules/Warehouses/queries/GetWarehouses.ts
packages/server/src/modules/Warehouses/subscribers/Activate/BillWarehousesActivateSubscriber.ts
packages/server/src/modules/Warehouses/subscribers/Activate/CreditNoteWarehousesActivateSubscriber.ts
packages/server/src/modules/Warehouses/subscribers/Activate/EstimateWarehousesActivateSubscriber.ts
packages/server/src/modules/Warehouses/subscribers/Activate/InventoryTransactionsWarehousesActivateSubscriber.ts
packages/server/src/modules/Warehouses/subscribers/Activate/InvoiceWarehousesActivateSubscriber.ts
packages/server/src/modules/Warehouses/subscribers/Activate/ReceiptWarehousesActivateSubscriber.ts
packages/server/src/modules/Warehouses/subscribers/Activate/VendorCreditWarehousesActivateSubscriber.ts
packages/server/src/modules/Warehouses/subscribers/DeleteItemWarehousesQuantitySubscriber.ts
packages/server/src/modules/Warehouses/subscribers/Validators/InventoryAdjustment/InventoryAdjustmentWarehouseValidatorSubscriber.ts
packages/server/src/modules/Warehouses/subscribers/Validators/Purchases/BillWarehousesSubscriber.ts
packages/server/src/modules/Warehouses/subscribers/Validators/Purchases/VendorCreditWarehousesSubscriber.ts
packages/server/src/modules/Warehouses/subscribers/Validators/Sales/CreditNoteWarehousesSubscriber.ts
packages/server/src/modules/Warehouses/subscribers/Validators/Sales/SaleEstimateWarehousesSubscriber.ts
packages/server/src/modules/Warehouses/subscribers/Validators/Sales/SaleInvoicesWarehousesSubscriber.ts
packages/server/src/modules/Warehouses/subscribers/Validators/Sales/SaleReceiptWarehousesSubscriber.ts
packages/server/src/modules/Warehouses/UpdateInventoryTransactionsWithWarehouse.ts
packages/server/src/modules/Warehouses/Warehouse.types.ts
packages/server/src/modules/Warehouses/WarehouseItems.controller.ts
packages/server/src/modules/Warehouses/Warehouses.controller.ts
packages/server/src/modules/Warehouses/Warehouses.module.ts
packages/server/src/modules/Warehouses/WarehousesApplication.service.ts
packages/server/src/modules/Warehouses/WarehousesSettings.ts
packages/server/src/modules/WarehousesTransfers/commands/CommandWarehouseTransfer.ts
packages/server/src/modules/WarehousesTransfers/commands/CreateWarehouseTransfer.ts
packages/server/src/modules/WarehousesTransfers/commands/DeleteWarehouseTransfer.ts
packages/server/src/modules/WarehousesTransfers/commands/EditWarehouseTransfer.ts
packages/server/src/modules/WarehousesTransfers/commands/InitiateWarehouseTransfer.ts
packages/server/src/modules/WarehousesTransfers/commands/TransferredWarehouseTransfer.ts
packages/server/src/modules/WarehousesTransfers/commands/WarehouseTransferAutoIncrement.ts
packages/server/src/modules/WarehousesTransfers/commands/WarehouseTransferWriteInventoryTransactions.ts
packages/server/src/modules/WarehousesTransfers/constants.ts
packages/server/src/modules/WarehousesTransfers/dtos/WarehouseTransfer.dto.ts
packages/server/src/modules/WarehousesTransfers/dtos/WarehouseTransferResponse.dto.ts
packages/server/src/modules/WarehousesTransfers/models/WarehouseTransfer.meta.ts
packages/server/src/modules/WarehousesTransfers/models/WarehouseTransfer.ts
packages/server/src/modules/WarehousesTransfers/models/WarehouseTransferEntry.ts
packages/server/src/modules/WarehousesTransfers/queries/GetWarehouseTransfer.ts
packages/server/src/modules/WarehousesTransfers/queries/GetWarehouseTransfers.ts
packages/server/src/modules/WarehousesTransfers/queries/WarehouseTransferItemTransformer.ts
packages/server/src/modules/WarehousesTransfers/queries/WarehouseTransferTransfomer.ts
packages/server/src/modules/WarehousesTransfers/susbcribers/WarehouseTransferAutoIncrementSubscriber.ts
packages/server/src/modules/WarehousesTransfers/susbcribers/WarehouseTransferInventoryTransactionsSubscriber.ts
packages/server/src/modules/WarehousesTransfers/WarehouseTransferApplication.ts
packages/server/src/modules/WarehousesTransfers/WarehouseTransfers.controller.ts
packages/server/src/modules/WarehousesTransfers/WarehouseTransfers.module.ts
packages/server/src/utils/accum-sum.ts
packages/server/src/utils/address-text-format.ts
packages/server/src/utils/all-conditions-passed.ts
packages/server/src/utils/assoc-depth-level-to-object-tree.ts
packages/server/src/utils/associate-item-entries-index.ts
packages/server/src/utils/cast-comma-list-envvar-Array.ts
packages/server/src/utils/date-range-collection.ts
packages/server/src/utils/deepdash.ts
packages/server/src/utils/entries-amount-diff.ts
packages/server/src/utils/flat-to-nested-array.ts
packages/server/src/utils/format-date-fields.ts
packages/server/src/utils/format-message.ts
packages/server/src/utils/format-number.ts
packages/server/src/utils/increment.ts
packages/server/src/utils/is-blank.ts
packages/server/src/utils/items-start-with.ts
packages/server/src/utils/moment-mysql.ts
packages/server/src/utils/multi-number-parse.ts
packages/server/src/utils/nested-array-to-flatten.ts
packages/server/src/utils/parse-boolean.ts
packages/server/src/utils/parse-json.ts
packages/server/src/utils/running-balance.ts
packages/server/src/utils/sanitize-database-name.ts
packages/server/src/utils/sanitize-model-name.ts
packages/server/src/utils/template-render.ts
packages/server/src/utils/transaction-increment.ts
packages/server/src/utils/transform-to-key.ts
packages/server/src/utils/transform-to-map-by.ts
packages/server/src/utils/transform-to-map-key-value.ts
```

### `find packages/server/src/database -type f | sort`

```
packages/server/src/database/system/migrations/20190104195900_create_password_resets_table.js
packages/server/src/database/system/migrations/20200420134631_create_tenants_table.js
packages/server/src/database/system/migrations/20200420134633_create_users_table.js
packages/server/src/database/system/migrations/20200422225247_create_user_invites_table.js
packages/server/src/database/system/migrations/20200527091642_create_subscriptions_plans_table.js
packages/server/src/database/system/migrations/20200823234134_create_plans_table.js
packages/server/src/database/system/migrations/20200823234636_create_subscription_plan_subscription.js
packages/server/src/database/system/migrations/20200823235340_create_tenants_metadata_table.js
packages/server/src/database/system/migrations/20230405011450_drop_phone_number_column_from_users_table.js
packages/server/src/database/system/migrations/20231012112401_add_tax_number_column_to_tenants_metadata_table.js
packages/server/src/database/system/migrations/20231209230719_create_imports_table.js
packages/server/src/database/system/migrations/20240222134235_create_plaid_items_table.js
packages/server/src/database/system/migrations/20240222134235_seed_free_subscription_to_tenants.js
packages/server/src/database/system/migrations/20240425100821_add_confirmation_columns_to_users.js
packages/server/src/database/system/migrations/20240714101006_add_lemon_variant_id_to_subscription_plans.js
packages/server/src/database/system/migrations/20240714101229_seed_monthly_subscription_plans.js
packages/server/src/database/system/migrations/20240727094214_add_lemon_subscription_id_to_subscriptions_table.js
packages/server/src/database/system/migrations/20240728123419_add_trial_columns_to_subscription_table.js
packages/server/src/database/system/migrations/20240819164614_create_oneclick_demos_table.js
packages/server/src/database/system/migrations/20240824151006_add_payment_status_to_subscriptions_table.js
packages/server/src/database/system/migrations/20240909091320_create_stripe_connect_accounts_table.js
packages/server/src/database/system/migrations/20240915070439_create_payment_links_table.js
packages/server/src/database/system/migrations/20240928145627_add_logo_key_to_tenant_metadata.js
packages/server/src/database/system/migrations/20251102082642_create_api_keys_table.js
packages/server/src/database/system/seeds/seed_subscriptions_plans.js
packages/server/src/database/system/seeds/seed_tenants_free_subscription.js
packages/server/src/database/tenant/migrations/20190822214303_create_accounts_table.ts
packages/server/src/database/tenant/migrations/20190822214304_create_items_categories_table.ts
packages/server/src/database/tenant/migrations/20190822214306_create_items_table.ts
packages/server/src/database/tenant/migrations/20190822214903_create_views_table.ts
packages/server/src/database/tenant/migrations/20190822214904_create_settings_table.ts
packages/server/src/database/tenant/migrations/20190822214905_create_views_columns.ts
packages/server/src/database/tenant/migrations/20190822214905_create_views_roles_table.ts
packages/server/src/database/tenant/migrations/20200104232644_create_contacts_table.ts
packages/server/src/database/tenant/migrations/20200104232647_create_accounts_transactions_table.ts
packages/server/src/database/tenant/migrations/20200105014405_create_expenses_table.ts
packages/server/src/database/tenant/migrations/20200105195823_create_manual_journals_table.ts
packages/server/src/database/tenant/migrations/20200105195825_create_manual_journals_entries_table.ts
packages/server/src/database/tenant/migrations/20200419171451_create_currencies_table.ts
packages/server/src/database/tenant/migrations/20200419191832_create_exchange_rates_table.ts
packages/server/src/database/tenant/migrations/20200423201600_create_media_table.ts
packages/server/src/database/tenant/migrations/20200503032011_create_media_links_table.ts
packages/server/src/database/tenant/migrations/20200606113848_create_expense_transactions_categories_table.ts
packages/server/src/database/tenant/migrations/20200713192127_create_sales_estimates_table.ts
packages/server/src/database/tenant/migrations/20200713213303_create_sales_receipt_table.ts
packages/server/src/database/tenant/migrations/20200715193633_create_sale_invoices_table.ts
packages/server/src/database/tenant/migrations/20200715194514_create_payment_receives_table.ts
packages/server/src/database/tenant/migrations/20200718161031_create_payment_receives_entries_table.ts
packages/server/src/database/tenant/migrations/20200719152005_create_bills_table.ts
packages/server/src/database/tenant/migrations/20200719153909_create_bills_payments_table.ts
packages/server/src/database/tenant/migrations/20200722164251_create_inventory_transactions_table.ts
packages/server/src/database/tenant/migrations/20200722164252_create_landed_cost_table.ts
packages/server/src/database/tenant/migrations/20200722164253_create_landed_cost_entries_table.ts
packages/server/src/database/tenant/migrations/20200722164255_create_inventory_transaction_meta_table.ts
packages/server/src/database/tenant/migrations/20200722173423_create_items_entries_table.ts
packages/server/src/database/tenant/migrations/20200728161617_create_bill_payments_entries.ts
packages/server/src/database/tenant/migrations/20200810121807_create_inventory_cost_lot_tracker_table.ts
packages/server/src/database/tenant/migrations/20200810121809_create_inventory_adjustments_table.ts
packages/server/src/database/tenant/migrations/20200810121810_create_inventory_adjustments_entries_table.ts
packages/server/src/database/tenant/migrations/20200810121910_create_cashflow_transactions_table.ts
packages/server/src/database/tenant/migrations/20210810121910_create_cashflow_transaction_lines_table.ts
packages/server/src/database/tenant/migrations/20210910121910_add_invoices_writtenoff_columns.ts
packages/server/src/database/tenant/migrations/20211012121910_add_costable_column_to_account_transactions.ts
packages/server/src/database/tenant/migrations/20211014121910_add_roles_table.ts
packages/server/src/database/tenant/migrations/20211112121920_create_users_table.ts
packages/server/src/database/tenant/migrations/20211122121920_create_credit_notes_table.ts
packages/server/src/database/tenant/migrations/20211122121920_create_vendor_credits_table.ts
packages/server/src/database/tenant/migrations/20211123121920_create_refund_transactions_table.ts
packages/server/src/database/tenant/migrations/20211124121920_create_credit_note_applies_invoices.ts
packages/server/src/database/tenant/migrations/20220124121920_create_branches_table.ts
packages/server/src/database/tenant/migrations/20220124121920_create_warehouses_table.ts
packages/server/src/database/tenant/migrations/20220125021920_create_items_warehouses_quantity.ts
packages/server/src/database/tenant/migrations/20220125121920_add_branch_column_to_accounts_transactions.ts
packages/server/src/database/tenant/migrations/20220125121920_add_branch_warehouse_columns_to_purchases.ts
packages/server/src/database/tenant/migrations/20220125121920_add_branch_warehouse_columns_to_sales.ts
packages/server/src/database/tenant/migrations/20220125121920_add_warehouse_column_to_inventory_transactions.ts
packages/server/src/database/tenant/migrations/20220125121920_add_warehouse_column_to_items_entries.ts
packages/server/src/database/tenant/migrations/20220128121920_add_exchange_rate_to_transactions.ts
packages/server/src/database/tenant/migrations/20220129121920_add_writtenoff_expense_account_to_invoices.ts
packages/server/src/database/tenant/migrations/20220229121920_rename_contacts_shipping_billing_addresses.ts
packages/server/src/database/tenant/migrations/20220329121920_add_cashflow_credit_account.ts
packages/server/src/database/tenant/migrations/20220329121920_add_seed_at_column_to_accounts.ts
packages/server/src/database/tenant/migrations/20220429121920_create_projects_table.ts
packages/server/src/database/tenant/migrations/20220429121922_add_project_id_to_expense_lines.ts
packages/server/src/database/tenant/migrations/20230405232607_drop_phone_number_from_users.ts
packages/server/src/database/tenant/migrations/20230810191606_create_tax_rates.ts
packages/server/src/database/tenant/migrations/20231004012644_add_tax_amount_withheld_to_bills_table.ts
packages/server/src/database/tenant/migrations/20231004020636_add_sell_purchase_tax_to_items_table.ts
packages/server/src/database/tenant/migrations/20231108170207_create_storage_table.ts
packages/server/src/database/tenant/migrations/20231202124014_change_item_entries_rate_to_float.ts
packages/server/src/database/tenant/migrations/20240201160214_create_plaid_items_Table.ts
packages/server/src/database/tenant/migrations/20240201235818_add_plaid_account_id_to_accounts_table.ts
packages/server/src/database/tenant/migrations/20240204180554_add_plaid_transaction_id_to_cashflow_transaction.ts
packages/server/src/database/tenant/migrations/20240228183404_create_uncateogrized_cashflow_transactions_table.ts
packages/server/src/database/tenant/migrations/20240304153926_add_uncategorized_transactions_column_to_accounts_table.ts
packages/server/src/database/tenant/migrations/20240308122047_add_uncategorized_transaction_id_to_cashflow_transactions.ts
packages/server/src/database/tenant/migrations/20240604153938_drop_storage_table.ts
packages/server/src/database/tenant/migrations/20240604153951_create_documents_table.ts
packages/server/src/database/tenant/migrations/20240604154005_create_documents_links_table.ts
packages/server/src/database/tenant/migrations/20240618100137_create_bank_rules_table.ts
packages/server/src/database/tenant/migrations/20240618171553_create_recognized_bank_transactions_table.ts
packages/server/src/database/tenant/migrations/20240618175241_add_recognized_transaction_id_to_uncategorized_transactins_table.ts
packages/server/src/database/tenant/migrations/20240619133733_create_matched_bank_transactions_table.ts
packages/server/src/database/tenant/migrations/20240620111308_add_excluded_column_to_uncategorized_cashflow_transactions_table.ts
packages/server/src/database/tenant/migrations/20240623154149_add_batch_column_to_uncategorized_cashflow_transactions_table.ts
packages/server/src/database/tenant/migrations/20240704064858_change_settings_value_to_text.ts
packages/server/src/database/tenant/migrations/20240709122347_move_cashflow_transaction_type_to_transaction_type_column.ts
packages/server/src/database/tenant/migrations/20240716114732_add_plaid_item_id_to_accounts_table.ts
packages/server/src/database/tenant/migrations/20240729172403_add_is_syncing_owner_to_accounts_table.ts
packages/server/src/database/tenant/migrations/20240801130829_change_tax_amount_withheld_column_precision_in_bills_and_sales_invoices_tables.ts
packages/server/src/database/tenant/migrations/20240804084709_create_paused_at_column_to_plaid_items_table.ts
packages/server/src/database/tenant/migrations/20240811121028_add_pending_column_to_uncategorized_transactions_table.ts
packages/server/src/database/tenant/migrations/20240909101051_add_stripe_pintent_id_to_payments_received.ts
packages/server/src/database/tenant/migrations/20240911112147_create_pdf_templates_table.ts
packages/server/src/database/tenant/migrations/20240915155403_payment_integration.ts
packages/server/src/database/tenant/migrations/20240915163722_creat_transaction_payment_service_table.ts
packages/server/src/database/tenant/migrations/20240915195024_seed_standard_pdf_templates.ts
packages/server/src/database/tenant/migrations/20241113113437_change_quantity_in_items_entries_to_decimal.ts
packages/server/src/database/tenant/migrations/20241128080734_add_discount_to_invoices_table.ts
packages/server/src/database/tenant/migrations/20241128081259_add_discount_to_estimates_table.ts
packages/server/src/database/tenant/migrations/20241128084550_add_discount_to_receipts_table.ts
packages/server/src/database/tenant/migrations/20241128085243_add_discount_to_bills_table.ts
packages/server/src/database/tenant/migrations/20241128090222_add_discount_to_credit_notes_table.ts
packages/server/src/database/tenant/migrations/20241128160604_add_discount_to_vendor_credits_table.ts
packages/server/src/database/tenant/migrations/20241211103019_add_discount_type_to_items_entries_table.ts
packages/server/src/database/tenant/migrations/20250326120000_add_contact_code_to_contacts.ts
packages/server/src/database/tenant/migrations/20260316000000_fix_account_type_typos.ts
packages/server/src/database/tenant/seeds/core/20190423085242_seed_accounts.ts
packages/server/src/database/tenant/seeds/core/20200810121809_seed_settings.ts
packages/server/src/database/tenant/seeds/core/20200810121909_seed_items_settings.ts
packages/server/src/database/tenant/seeds/core/20210810121909_seed_roles.ts
packages/server/src/database/tenant/seeds/core/20210812121909_seed_roles_permissions.ts
packages/server/src/database/tenant/seeds/core/20210912121909_seed_credit_settings.ts
packages/server/src/database/tenant/seeds/core/20230912121909_seed_tax_rates.ts
packages/server/src/database/tenant/seeds/core/20230912121909_update_tax_payable_account.ts
packages/server/src/database/tenant/seeds/core/index.ts
packages/server/src/database/tenant/seeds/data/accounts.ts
packages/server/src/database/tenant/seeds/data/TaxRates.ts
```

### `find packages/webapp/src/hooks -type f | sort`

```
packages/webapp/src/hooks/constants/useSubscriptionPlans.tsx
packages/webapp/src/hooks/dashboard/index.tsx
packages/webapp/src/hooks/dashboard/useKeywordShortcuts.tsx
packages/webapp/src/hooks/dialogs/useBulkDeleteDialog.ts
packages/webapp/src/hooks/index.tsx
packages/webapp/src/hooks/query/accounts.tsx
packages/webapp/src/hooks/query/apiKeys.tsx
packages/webapp/src/hooks/query/attachments.ts
packages/webapp/src/hooks/query/authentication.tsx
packages/webapp/src/hooks/query/bank-accounts.ts
packages/webapp/src/hooks/query/bank-rules.ts
packages/webapp/src/hooks/query/bank-transaction.ts
packages/webapp/src/hooks/query/bank-transactions.ts
packages/webapp/src/hooks/query/base.tsx
packages/webapp/src/hooks/query/bills.tsx
packages/webapp/src/hooks/query/branches.tsx
packages/webapp/src/hooks/query/cashflowAccounts.tsx
packages/webapp/src/hooks/query/contacts.tsx
packages/webapp/src/hooks/query/creditNote.tsx
packages/webapp/src/hooks/query/currencies.tsx
packages/webapp/src/hooks/query/customers.tsx
packages/webapp/src/hooks/query/estimates.tsx
packages/webapp/src/hooks/query/exchangeRates.tsx
packages/webapp/src/hooks/query/expenses.tsx
packages/webapp/src/hooks/query/FinancialReports/index.ts
packages/webapp/src/hooks/query/FinancialReports/use-AP-aging-summary.ts
packages/webapp/src/hooks/query/FinancialReports/use-AR-aging-summary.ts
packages/webapp/src/hooks/query/FinancialReports/use-balance-sheet.ts
packages/webapp/src/hooks/query/FinancialReports/use-cashflow-sheet.ts
packages/webapp/src/hooks/query/FinancialReports/use-customer-balance-summary.ts
packages/webapp/src/hooks/query/FinancialReports/use-customer-transactions.ts
packages/webapp/src/hooks/query/FinancialReports/use-export.ts
packages/webapp/src/hooks/query/FinancialReports/use-export-pdf.ts
packages/webapp/src/hooks/query/FinancialReports/use-general-ledger.ts
packages/webapp/src/hooks/query/FinancialReports/use-inventory-item-details.ts
packages/webapp/src/hooks/query/FinancialReports/use-inventory-valuation.ts
packages/webapp/src/hooks/query/FinancialReports/use-journal-sheet.ts
packages/webapp/src/hooks/query/FinancialReports/use-profit-loss-sheet.ts
packages/webapp/src/hooks/query/FinancialReports/use-purchases-by-items.ts
packages/webapp/src/hooks/query/FinancialReports/use-sales-by-items.ts
packages/webapp/src/hooks/query/FinancialReports/use-sales-tax-liabilities-summary.ts
packages/webapp/src/hooks/query/FinancialReports/use-transactions-by-reference.ts
packages/webapp/src/hooks/query/FinancialReports/use-trial-balance-sheet.ts
packages/webapp/src/hooks/query/FinancialReports/use-vendor-balance-summary.ts
packages/webapp/src/hooks/query/FinancialReports/use-vendor-transactions.ts
packages/webapp/src/hooks/query/GenericResource/index.tsx
packages/webapp/src/hooks/query/import.ts
packages/webapp/src/hooks/query/index.tsx
packages/webapp/src/hooks/query/inventoryAdjustments.tsx
packages/webapp/src/hooks/query/invite.tsx
packages/webapp/src/hooks/query/invoices.tsx
packages/webapp/src/hooks/query/items.tsx
packages/webapp/src/hooks/query/itemsCategories.tsx
packages/webapp/src/hooks/query/jobs.tsx
packages/webapp/src/hooks/query/landedCost.tsx
packages/webapp/src/hooks/query/manualJournals.tsx
packages/webapp/src/hooks/query/misc.tsx
packages/webapp/src/hooks/query/oneclick-demo.ts
packages/webapp/src/hooks/query/organization.tsx
packages/webapp/src/hooks/query/payment-link.ts
packages/webapp/src/hooks/query/paymentMades.tsx
packages/webapp/src/hooks/query/payment-methods.ts
packages/webapp/src/hooks/query/paymentReceives.tsx
packages/webapp/src/hooks/query/payment-services.ts
packages/webapp/src/hooks/query/pdf-templates.ts
packages/webapp/src/hooks/query/plaid.ts
packages/webapp/src/hooks/query/receipts.tsx
packages/webapp/src/hooks/query/roles.tsx
packages/webapp/src/hooks/query/settings.tsx
packages/webapp/src/hooks/query/stripe-integration.ts
packages/webapp/src/hooks/query/subscription.tsx
packages/webapp/src/hooks/query/subscriptions.tsx
packages/webapp/src/hooks/query/taxRates.ts
packages/webapp/src/hooks/query/transactionsLocking.tsx
packages/webapp/src/hooks/query/types.tsx
packages/webapp/src/hooks/query/UniversalSearch/UniversalSearch.tsx
packages/webapp/src/hooks/query/users.tsx
packages/webapp/src/hooks/query/useStockixOrgs.tsx
packages/webapp/src/hooks/query/vendorCredit.tsx
packages/webapp/src/hooks/query/vendors.tsx
packages/webapp/src/hooks/query/views.tsx
packages/webapp/src/hooks/query/warehouses.tsx
packages/webapp/src/hooks/query/warehousesTransfers.tsx
packages/webapp/src/hooks/state/authentication.tsx
packages/webapp/src/hooks/state/autofill.ts
packages/webapp/src/hooks/state/banking.ts
packages/webapp/src/hooks/state/dashboard.tsx
packages/webapp/src/hooks/state/feature.tsx
packages/webapp/src/hooks/state/globalErrors.tsx
packages/webapp/src/hooks/state/index.tsx
packages/webapp/src/hooks/state/organizations.tsx
packages/webapp/src/hooks/state/settings.tsx
packages/webapp/src/hooks/state/subscriptions.tsx
packages/webapp/src/hooks/useAutofocus.tsx
packages/webapp/src/hooks/useDarkMode.ts
packages/webapp/src/hooks/useDownloadFile.ts
packages/webapp/src/hooks/useMedia.tsx
packages/webapp/src/hooks/useMediaQuery.ts
packages/webapp/src/hooks/useQueryRequest.tsx
packages/webapp/src/hooks/useQueryString.ts
packages/webapp/src/hooks/useRequest.tsx
packages/webapp/src/hooks/useRequestPdf.tsx
packages/webapp/src/hooks/useUncontrolled.ts
packages/webapp/src/hooks/utils/index.tsx
packages/webapp/src/hooks/utils/useAbilityContext.tsx
packages/webapp/src/hooks/utils/useClipboard.ts
packages/webapp/src/hooks/utils/useCustomCompareEffect.ts
packages/webapp/src/hooks/utils/useDeepCompareEffect.ts
packages/webapp/src/hooks/utils/useIntersectionObserver.tsx
packages/webapp/src/hooks/utils/useLocalStorage.tsx
packages/webapp/src/hooks/utils/useOpenPlaidConnect.ts
packages/webapp/src/hooks/utils/usePrevious.tsx
packages/webapp/src/hooks/utils/useUpdateEffect.tsx
packages/webapp/src/hooks/utils/useWatch.tsx
packages/webapp/src/hooks/utils/useWhen.tsx
```

### `find packages/webapp/src/store -type f | sort`

```
packages/webapp/src/store/accounts/accounts.actions.tsx
packages/webapp/src/store/accounts/accounts.reducer.tsx
packages/webapp/src/store/accounts/accounts.selectors.tsx
packages/webapp/src/store/accounts/accounts.types.tsx
packages/webapp/src/store/authentication/authentication.actions.tsx
packages/webapp/src/store/authentication/authentication.reducer.tsx
packages/webapp/src/store/authentication/authentication.selectors.tsx
packages/webapp/src/store/authentication/authentication.types.tsx
packages/webapp/src/store/banking/banking.reducer.ts
packages/webapp/src/store/billing/Billing.action.tsx
packages/webapp/src/store/Bills/bills.actions.tsx
packages/webapp/src/store/Bills/bills.reducer.tsx
packages/webapp/src/store/Bills/bills.selectors.tsx
packages/webapp/src/store/Bills/bills.type.tsx
packages/webapp/src/store/CashflowAccounts/CashflowAccounts.actions.tsx
packages/webapp/src/store/CashflowAccounts/CashflowAccounts.reducer.tsx
packages/webapp/src/store/CashflowAccounts/CashflowAccounts.selectors.tsx
packages/webapp/src/store/CashflowAccounts/CashflowAccounts.types.tsx
packages/webapp/src/store/createStore.tsx
packages/webapp/src/store/CreditNote/creditNote.actions.tsx
packages/webapp/src/store/CreditNote/creditNote.reducer.tsx
packages/webapp/src/store/CreditNote/creditNote.selector.tsx
packages/webapp/src/store/CreditNote/creditNote.type.tsx
packages/webapp/src/store/currencies/currencies.actions.tsx
packages/webapp/src/store/currencies/currencies.reducer.tsx
packages/webapp/src/store/currencies/currencies.selector.tsx
packages/webapp/src/store/currencies/currencies.types.tsx
packages/webapp/src/store/customers/customers.actions.tsx
packages/webapp/src/store/customers/customers.reducer.tsx
packages/webapp/src/store/customers/customers.selectors.tsx
packages/webapp/src/store/customers/customers.type.tsx
packages/webapp/src/store/customFields/customFields.actions.tsx
packages/webapp/src/store/customFields/customFields.reducer.tsx
packages/webapp/src/store/customFields/customFields.types.tsx
packages/webapp/src/store/customViews/customViews.actions.tsx
packages/webapp/src/store/customViews/customViews.reducer.tsx
packages/webapp/src/store/customViews/customViews.selectors.tsx
packages/webapp/src/store/customViews/customViews.types.tsx
packages/webapp/src/store/dashboard/dashboard.actions.tsx
packages/webapp/src/store/dashboard/dashboard.reducer.tsx
packages/webapp/src/store/dashboard/dashboard.selectors.tsx
packages/webapp/src/store/dashboard/dashboard.types.tsx
packages/webapp/src/store/enhancers/monitorReducer.tsx
packages/webapp/src/store/Estimate/estimates.actions.tsx
packages/webapp/src/store/Estimate/estimates.reducer.tsx
packages/webapp/src/store/Estimate/estimates.selectors.tsx
packages/webapp/src/store/Estimate/estimates.types.tsx
packages/webapp/src/store/ExchangeRate/exchange.actions.tsx
packages/webapp/src/store/ExchangeRate/exchange.reducer.tsx
packages/webapp/src/store/ExchangeRate/exchange.selector.tsx
packages/webapp/src/store/ExchangeRate/exchange.type.tsx
packages/webapp/src/store/expenses/expenses.actions.tsx
packages/webapp/src/store/expenses/expenses.reducer.tsx
packages/webapp/src/store/expenses/expenses.selectors.tsx
packages/webapp/src/store/expenses/expenses.types.tsx
packages/webapp/src/store/financialStatement/financialStatements.actions.tsx
packages/webapp/src/store/financialStatement/financialStatements.reducer.tsx
packages/webapp/src/store/financialStatement/financialStatements.selectors.tsx
packages/webapp/src/store/financialStatement/financialStatements.types.tsx
packages/webapp/src/store/globalErrors/globalErrors.actions.tsx
packages/webapp/src/store/globalErrors/globalErrors.reducer.tsx
packages/webapp/src/store/inventoryAdjustments/inventoryAdjustment.actions.tsx
packages/webapp/src/store/inventoryAdjustments/inventoryAdjustment.reducer.tsx
packages/webapp/src/store/inventoryAdjustments/inventoryAdjustment.selector.tsx
packages/webapp/src/store/inventoryAdjustments/inventoryAdjustment.type.tsx
packages/webapp/src/store/Invoice/invoices.actions.tsx
packages/webapp/src/store/Invoice/invoices.reducer.tsx
packages/webapp/src/store/Invoice/invoices.selector.tsx
packages/webapp/src/store/Invoice/invoices.types.tsx
packages/webapp/src/store/itemCategories/ItemsCategories.selectors.tsx
packages/webapp/src/store/itemCategories/itemsCategory.actions.tsx
packages/webapp/src/store/itemCategories/itemsCategory.reducer.tsx
packages/webapp/src/store/itemCategories/itemsCategory.type.tsx
packages/webapp/src/store/itemCategories/itemsCateory.reducer.tsx
packages/webapp/src/store/items/items.actions.tsx
packages/webapp/src/store/items/items.reducer.tsx
packages/webapp/src/store/items/items.selectors.tsx
packages/webapp/src/store/items/items.types.tsx
packages/webapp/src/store/journalNumber.reducer.tsx
packages/webapp/src/store/localStorage.tsx
packages/webapp/src/store/logger.middleware.ts
packages/webapp/src/store/manualJournals/manualJournals.actions.tsx
packages/webapp/src/store/manualJournals/manualJournals.reducers.tsx
packages/webapp/src/store/manualJournals/manualJournals.selectors.tsx
packages/webapp/src/store/manualJournals/manualJournals.types.tsx
packages/webapp/src/store/organizations/organizations.actions.tsx
packages/webapp/src/store/organizations/organizations.reducers.tsx
packages/webapp/src/store/organizations/organizations.selectors.tsx
packages/webapp/src/store/organizations/organizations.types.tsx
packages/webapp/src/store/organizations/withSetupWizard.tsx
packages/webapp/src/store/PaymentMades/paymentMades.actions.tsx
packages/webapp/src/store/PaymentMades/paymentMades.reducer.tsx
packages/webapp/src/store/PaymentMades/paymentMades.selector.tsx
packages/webapp/src/store/PaymentMades/paymentMades.type.tsx
packages/webapp/src/store/PaymentReceives/paymentReceives.actions.tsx
packages/webapp/src/store/PaymentReceives/paymentReceives.reducer.tsx
packages/webapp/src/store/PaymentReceives/paymentReceives.selector.tsx
packages/webapp/src/store/PaymentReceives/paymentReceives.type.tsx
packages/webapp/src/store/plans/plans.actions.tsx
packages/webapp/src/store/plans/plans.reducer.tsx
packages/webapp/src/store/plans/plans.selectors.tsx
packages/webapp/src/store/plans/plans.types.tsx
packages/webapp/src/store/preferences/preferences.actions.tsx
packages/webapp/src/store/preferences/preferences.types.tsx
packages/webapp/src/store/Project/projects.actions.ts
packages/webapp/src/store/Project/projects.reducer.ts
packages/webapp/src/store/Project/projects.selectors.ts
packages/webapp/src/store/Project/projects.type.ts
packages/webapp/src/store/queryReducers.tsx
packages/webapp/src/store/receipts/receipts.actions.tsx
packages/webapp/src/store/receipts/receipts.reducer.tsx
packages/webapp/src/store/receipts/receipts.selector.tsx
packages/webapp/src/store/receipts/receipts.type.tsx
packages/webapp/src/store/reducers.tsx
packages/webapp/src/store/registers/register.action.tsx
packages/webapp/src/store/registers/register.reducer.tsx
packages/webapp/src/store/registers/register.type.tsx
packages/webapp/src/store/ResetMiddleware.tsx
packages/webapp/src/store/resetPassword/resetPassword.action.tsx
packages/webapp/src/store/resources/resources.actions.tsx
packages/webapp/src/store/resources/resources.reducer.tsx
packages/webapp/src/store/resources/resources.selectors.tsx
packages/webapp/src/store/search/search.actions.tsx
packages/webapp/src/store/search/search.reducer.tsx
packages/webapp/src/store/search/search.type.tsx
packages/webapp/src/store/selectors.tsx
packages/webapp/src/store/settings/settings.actions.tsx
packages/webapp/src/store/settings/settings.reducer.tsx
packages/webapp/src/store/settings/settings.type.tsx
packages/webapp/src/store/subscription/subscription.actions.tsx
packages/webapp/src/store/subscription/subscription.reducer.tsx
packages/webapp/src/store/subscription/subscription.selectors.tsx
packages/webapp/src/store/subscription/subscription.types.tsx
packages/webapp/src/store/tableState.reducer.tsx
packages/webapp/src/store/types.tsx
packages/webapp/src/store/users/users.actions.tsx
packages/webapp/src/store/users/users.reducer.tsx
packages/webapp/src/store/users/users.selectors.tsx
packages/webapp/src/store/users/users.types.tsx
packages/webapp/src/store/VendorCredit/vendorCredit.actions.tsx
packages/webapp/src/store/VendorCredit/VendorCredit.reducer.tsx
packages/webapp/src/store/VendorCredit/vendorCredit.selector.tsx
packages/webapp/src/store/VendorCredit/vendorCredit.type.tsx
packages/webapp/src/store/vendors/vendors.actions.tsx
packages/webapp/src/store/vendors/vendors.reducer.tsx
packages/webapp/src/store/vendors/vendors.selectors.tsx
packages/webapp/src/store/vendors/vendors.types.tsx
packages/webapp/src/store/WarehouseTransfer/warehouseTransfer.actions.tsx
packages/webapp/src/store/WarehouseTransfer/warehouseTransfer.reducer.tsx
packages/webapp/src/store/WarehouseTransfer/warehouseTransfer.selector.tsx
packages/webapp/src/store/WarehouseTransfer/warehouseTransfer.type.tsx
```

### `find packages/webapp/src/containers/Dashboard/Sidebar -type f | sort`

```
packages/webapp/src/containers/Dashboard/Sidebar/hooks.tsx
packages/webapp/src/containers/Dashboard/Sidebar/interfaces.ts
packages/webapp/src/containers/Dashboard/Sidebar/Sidebar.tsx
packages/webapp/src/containers/Dashboard/Sidebar/SidebarContainer.tsx
packages/webapp/src/containers/Dashboard/Sidebar/SidebarHead.tsx
packages/webapp/src/containers/Dashboard/Sidebar/SidebarMenu.tsx
packages/webapp/src/containers/Dashboard/Sidebar/withDashboardSidebar.tsx
packages/webapp/src/containers/Dashboard/Sidebar/withDashboardSidebarActions.tsx
```

---

## Section 2 — File-by-file documentation (STEP 2)

*Line counts below are as read from disk on 2026-05-16.*

---

### Cross-cutting — JWT `signToken` / `verifyPayload` / routes

| Topic | Finding |
|--------|---------|
| **`signToken` implementation** | Only `packages/server/src/modules/Auth/commands/AuthSignin.service.ts` defines `signToken` (called from `Auth.controller.ts` sign-in handler). |
| **Explicit JWT payload fields in `signToken`** | **`sub`** only, set to `user.email` (`AuthSignin.service.ts` lines 72–76). The `@nestjs/jwt` `JwtService.sign` will add standard claims **`iat`** and **`exp`** (and the library may add others); `JwtPayload` in `Auth.interfaces.ts` documents `sub`, `iat`, `exp`. |
| **`verifyPayload` CLS (`clsService.set`)** | **`tenantId`** (line 59), **`userId`** (line 60). **No** `organizationId` is set here. |
| **`Jwt.strategy.ts`** | Path: `packages/server/src/modules/Auth/strategies/Jwt.strategy.ts` (not under `Auth/` root). Delegates `validate` → `authSigninService.verifyPayload`. No `cls.set` in this file. |
| **Other CLS setters in Auth signup / API key** | `AuthSignup.service.ts`: `tenantId`, `userId`, `organizationId` (lines 75–77). `AuthApiKeyAuthorization.service.ts`: `tenantId`, `organizationId`, `userId` (lines 44–46). |

**`@Post` / `@Get` route paths (exact string literals)**

* **`Auth.controller.ts`** — controller base `'auth'`: `@Post('/signin')`, `@Post('/signup')`, `@Post('/register')`, `@Post('/signup/verify')`, `@Post('/send_reset_password')`, `@Post('/reset_password/:token')`, `@Get('/meta')`, `@Get('/impersonate')`.
* **`Authed.controller.ts`** — base `'auth'`, guarded: `@Post('/signup/verify/resend')`, `@Get('/account')`.

---

### System DB — models (`packages/server/src/modules/System/models/*.ts`)

#### `packages/server/src/modules/System/models/SystemUser.ts` (48 lines)

- **Purpose:** Objection model for a row in the **system** `users` table; exposes password hashing/check helpers and query modifiers for invite acceptance and active users.
- **Functions/methods:** `tableName` getter (L16); `modifiers` static getter with nested `inviteAccepted` (L28), `active` (L32); `hashPassword` (L38); `checkPassword` (L45).
- **DB tables:** `users`.
- **Internal imports:** `@/models/Model` (`BaseModel`).
- **TODO/FIXME/HACK:** none.

#### `packages/server/src/modules/System/models/TenantModel.ts` (83 lines)

- **Purpose:** Objection model for `tenants` with virtuals `isReady`, `isBuildRunning`, `isUpgradeRunning` and relations to metadata and plan subscriptions.
- **Functions/methods:** `isReady` getter (L34); `isBuildRunning` (L42); `isUpgradeRunning` (L50); `relationMappings` static getter (L57); `tableName` (L20); `virtualAttributes` (L26).
- **DB tables:** `tenants`, `tenants_metadata`, `subscription_plan_subscriptions` (join targets in relation mappings).
- **Internal imports:** `@/models/Model`; `./TenantMetadataModel`; `@/modules/Subscription/models/PlanSubscription` (also dynamic `require` of same).
- **TODO/FIXME/HACK:** none.

#### `packages/server/src/modules/System/models/TenantMetadataModel.ts` (84 lines)

- **Purpose:** Objection model for organization display/settings in `tenants_metadata`; JSON schema, virtual `logoUri`, computed `addressTextFormatted`.
- **Functions/methods:** `jsonSchema` static getter (L26); `tableName` (L50); `timestamps` getter (L55); `virtualAttributes` (L62); `addressTextFormatted` getter (L70).
- **DB tables:** `tenants_metadata`.
- **Internal imports:** `@/models/Model`; `@/utils/address-text-format`; `@stockix/utils` (external package).
- **TODO/FIXME/HACK:** none.

#### `packages/server/src/modules/System/models/SystemModel.ts` (3 lines)

- **Purpose:** Empty extension of `BaseModel` used as the base for system-scoped auth models (e.g. `PasswordReset`, `ApiKeyModel`).
- **Functions/methods:** none declared.
- **DB tables:** none (abstract base).
- **Internal imports:** `@/models/Model`.
- **TODO/FIXME/HACK:** none.

#### `packages/server/src/modules/System/models/TenantBaseModel.ts` (17 lines)

- **Purpose:** Composes multiple tenant-side mixins (Ramda `pipe`) into a single base class for **tenant** DB models — not a system DB table mapping itself.
- **Functions/methods:** none (type export `TenantModelProxy` L17).
- **DB tables:** none directly.
- **Internal imports:** `ramda`; `@/models/Model`; `@/modules/CustomViews/CustomViewBaseModel`; `@/modules/DynamicListing/models/MetadataModel`; `@/modules/DynamicListing/models/SearchableBaseModel`; `@/modules/Resource/models/ResourcableModel`.
- **TODO/FIXME/HACK:** none.

**Glob `**/System/models/*.ts`:** the five files above are the complete set under `packages/server/src/modules/System/models/`.

---

### System DB — Knex configuration & `knex({` / `Knex({` usage

#### `packages/server/src/common/config/system-database.ts` (12 lines)

- **Purpose:** Nest `registerAs('systemDatabase', …)` mapping **environment variables** to Knex connection settings for the **system** database.
- **Env → config:** `client` fixed `'mysql'`; `host` â† `SYSTEM_DB_HOST` or `DB_HOST`; `port` â† `SYSTEM_DB_PORT` or `DB_PORT` or default `5432` (note: default port is PostgreSQL-style while client is MySQL); `user` â† `SYSTEM_DB_USER` or `DB_USER`; `password` â† `SYSTEM_DB_PASSWORD` or `DB_PASSWORD`; `databaseName` â† `SYSTEM_DB_NAME` or `DB_NAME`; migration/seeds dirs from `SYSTEM_DB_MIGRATION_DIR`, `SYSTEM_DB_SEEDS_DIR` with relative defaults.
- **Internal imports:** `@nestjs/config` only.
- **TODO/FIXME/HACK:** none.

#### `packages/server/src/modules/System/SystemDB/SystemDB.module.ts` (51 lines)

- **Purpose:** Global Nest module providing **`SystemKnexConnectionConfigure`** (plain config object) and **`SystemKnexConnection`** via **`Knex(knexConfig)`** (L39–40) — object passed to `Knex`, not an inline `Knex({` literal.
- **Connection fields:** `client`, `connection.host|user|password|database|charset`, `migrations` (`directory`, `loadExtensions: ['.js']`), `seeds`, `pool`, `knexSnakeCaseMappers`.
- **Internal imports:** `knex`; `@nestjs/common`; `@nestjs/config`; `./SystemDB.constants`; `objection` (`knexSnakeCaseMappers`); `./SystemDB.controller`; `./Ping.controller`.
- **TODO/FIXME/HACK:** none.

#### `packages/server/src/modules/CLI/commands/BaseCommand.ts` (85 lines)

- **Purpose:** CLI `Knex({ … })` factories mirroring app config for **system** (`initSystemKnex`, L14–32) and **tenant** (`initTenantKnex`, L36–57) databases.
- **Functions/methods:** `initSystemKnex` (L13); `initTenantKnex` (L35); `getAllSystemTenants` (L60); `getAllInitializedTenants` (L64); `exit` (L68); `success` (L77); `log` (L82).
- **DB tables:** string queries `tenants` (L61, L65).
- **Internal imports:** `nest-commander`; `@nestjs/common`; `@nestjs/config`; `knex`; `objection`.
- **TODO/FIXME/HACK:** none.

#### `packages/server/src/modules/Tenancy/TenancyDB/TenancyDB.module.ts` (57 lines)

- **Purpose:** CLS-backed provider that returns a per-organization Knex; builds DB name `bigcapital_tenant_${organizationId}`; creates instances with **`knex({ … })`** (L25).
- **Functions/methods:** `useFactory` closure (L17) building `knexInstance`.
- **DB tables:** none by name (dynamic database per org).
- **Internal imports:** `knex`; `lru-cache`; `@nestjs/common`; `objection`; `nestjs-cls`; `@nestjs/config`; `./TenancyDB.constants`; `./UnitOfWork.service`.
- **TODO/FIXME/HACK:** none.

#### Repo-wide search `knex({` **or** `Knex({`

Only **three** occurrences in `packages/server/src` (all documented above):

1. `BaseCommand.ts` L14 — `Knex({`
2. `BaseCommand.ts` L36 — `Knex({`
3. `TenancyDB.module.ts` L25 — `knex({`

`SystemDB.module.ts` uses **`Knex(knexConfig)`** where `knexConfig` is injected — not matched by the literal pattern `Knex({`.

---

### `packages/server/src/config/`

- **Result:** directory **does not exist** (no files). Application config lives under `packages/server/src/common/config/` (loaded via `ConfigModule` in `App.module.ts` importing `../../common/config`).

---

### Environment & system DB (search: `DB_HOST`, `SYSTEM_DB`, `DATABASE_URL`, `knex`)

| Source | Notes |
|--------|--------|
| `packages/server/.env.example` and repo-root `services/stockix-finance/.env.example` | **`DB_HOST`**, **`DB_USER`**, **`DB_PASSWORD`**, **`DB_ROOT_PASSWORD`**, **`DB_CHARSET`**; **`SYSTEM_DB_NAME`**; commented **`SYSTEM_DB_USER`**, **`SYSTEM_DB_PASSWORD`**, **`SYSTEM_DB_NAME`**, **`SYSTEM_DB_CHARSET`**; tenant **`TENANT_DB_NAME_PERFIX`**, optional **`TENANT_DB_*`**. No **`DATABASE_URL`** for MySQL. **`knex`** not mentioned in `.env.example`. |
| `packages/server/src/common/config/system-database.ts` | Defines **`SYSTEM_DB_HOST`**, **`SYSTEM_DB_PORT`**, **`SYSTEM_DB_USER`**, **`SYSTEM_DB_PASSWORD`**, **`SYSTEM_DB_NAME`**, **`SYSTEM_DB_MIGRATION_DIR`**, **`SYSTEM_DB_SEEDS_DIR`** with fallbacks to **`DB_*`** (and default migration/seed paths). |

**What env vars control the system DB connection today:**  
**Primary:** `SYSTEM_DB_HOST` (else `DB_HOST`), `SYSTEM_DB_USER` (else `DB_USER`), `SYSTEM_DB_PASSWORD` (else `DB_PASSWORD`), `SYSTEM_DB_NAME` (else `DB_NAME`), `SYSTEM_DB_PORT` (else `DB_PORT`). **Optional:** `SYSTEM_DB_MIGRATION_DIR`, `SYSTEM_DB_SEEDS_DIR`. **`DATABASE_URL` is not used** in the searched finance service `.env.example` / `system-database.ts` for this MySQL system connection.

---

### Migrations — system (`packages/server/src/database/system/migrations/`)

- **Count:** 24 files.
- **Naming:** Leading **`YYYYMMDDHHMMSS`** timestamp + snake_case description; extension **`.js`** (Knex `loadExtensions: ['.js']` in system Knex config).
- **Creates `tenants`:** `20200420134631_create_tenants_table.js`.
- **Creates `users`:** `20200420134633_create_users_table.js`.

**First 10 lines per file (verbatim excerpts):**

#### `20190104195900_create_password_resets_table.js`

```
exports.up = (knex) => knex.schema.createTable('password_resets', (table) => {
  table.increments();
  table.string('email').index();
  table.string('token').index();
  table.timestamp('created_at');
});

exports.down = (knex) => knex.schema.dropTableIfExists('password_resets');
```

#### `20200420134631_create_tenants_table.js`

```
exports.up = function(knex) {
  return knex.schema.createTable('tenants', (table) => {
    table.bigIncrements();
    table.string('organization_id').index();

    table.dateTime('under_maintenance_since').nullable();
    table.dateTime('initialized_at').nullable();
    table.dateTime('seeded_at').nullable();
    table.dateTime('built_at').nullable();
```

#### `20200420134633_create_users_table.js`

```
exports.up = (knex) => {
  return knex.schema.createTable('users', (table) => {
    table.increments();
    table.string('first_name');
    table.string('last_name');
    table.string('email').index();
    table.string('phone_number').index();
    table.string('password');
    table.boolean('active').index();
    table.string('language');
```

#### `20200422225247_create_user_invites_table.js`

```
exports.up = function(knex) {
  return knex.schema.createTable('user_invites', (table) => {
    table.increments();
    table.string('email').index();
    table.string('token').unique().index();
    table.bigInteger('tenant_id').unsigned().index().references('id').inTable('tenants');
    table.integer('user_id').unsigned().index().references('id').inTable('users');
    table.datetime('created_at');
  });
```

#### `20200527091642_create_subscriptions_plans_table.js`

```
exports.up = function(knex) {
  return knex.schema.createTable('subscriptions_plans', table => {
    table.increments();

    table.string('name');
    table.string('description');
    table.decimal('price');
    table.string('currency', 3);
```

#### `20200823234134_create_plans_table.js`

```
exports.up = function(knex) {
  return knex.schema.createTable('subscription_plans', table => {
    table.increments();
    table.string('slug');
    table.string('name');
    table.string('desc');
    table.boolean('active');

    table.decimal('price').unsigned();
```

#### `20200823234636_create_subscription_plan_subscription.js`

```
exports.up = function(knex) {
  return knex.schema.createTable('subscription_plan_subscriptions', table => {
    table.increments('id');
    table.string('slug');

    table.integer('plan_id').unsigned().index().references('id').inTable('subscription_plans');
    table.bigInteger('tenant_id').unsigned().index().references('id').inTable('tenants');

    table.dateTime('starts_at').nullable();
```

#### `20200823235340_create_tenants_metadata_table.js`

```
exports.up = function (knex) {
  return knex.schema.createTable('tenants_metadata', (table) => {
    table.bigIncrements();
    table.integer('tenant_id').unsigned();

    table.string('name');
    table.string('industry');
    table.string('location');

    table.string('base_currency');
```

#### `20230405011450_drop_phone_number_column_from_users_table.js`

```
exports.up = function (knex) {
  return knex.schema.table('users', (table) => {
    table.dropColumn('phone_number');
  });
};

exports.down = function (knex) {
  return knex.schema.table('users', (table) => {});
};
```

#### `20231012112401_add_tax_number_column_to_tenants_metadata_table.js`

```
exports.up = function (knex) {
  return knex.schema.table('tenants_metadata', (table) => {
    table.string('tax_number')
  });
};

exports.down = function (knex) {
  return knex.schema.table('tenants_metadata', (table) => {
    table.dropColumn('tax_number');
  });
```

#### `20231209230719_create_imports_table.js`

```
exports.up = function (knex) {
  return knex.schema.createTable('imports', (table) => {
    table.increments();
    table.string('filename');
    table.string('import_id');
    table.string('resource');
    table.json('columns');
    table.json('mapping');
    table.json('params');
    table
```

#### `20240222134235_create_plaid_items_table.js`

```
exports.up = function (knex) {
  return knex.schema.createTable('plaid_items', (table) => {
    table.bigIncrements('id');
    table
      .bigInteger('tenant_id')
      .unsigned()
      .index()
      .references('id')
      .inTable('tenants');
    table.string('plaid_item_id');
```

#### `20240222134235_seed_free_subscription_to_tenants.js`

```
exports.up = function (knex) {
  return knex.seed.run({
    specific: 'seed_tenants_free_subscription.js',
  });
};

exports.down = function (knex) {};
```

#### `20240425100821_add_confirmation_columns_to_users.js`

```
exports.up = function (knex) {
  return knex.schema
    .table('users', (table) => {
      table.string('verify_token');
      table.boolean('verified').defaultTo(false);
    })
    .then(() => {
      return knex('USERS').update({ verified: true });
    });
};
```

#### `20240714101006_add_lemon_variant_id_to_subscription_plans.js`

```
exports.up = function (knex) {
  return knex.schema.table('subscription_plans', (table) => {
    table.string('lemon_variant_id').nullable().index();
  });
};

exports.down = (knex) => {
  return knex.schema.table('subscription_plans', (table) => {
    table.dropColumn('lemon_variant_id');
  });
```

#### `20240714101229_seed_monthly_subscription_plans.js`

```
exports.up = function (knex) {
  return knex('subscription_plans').insert([
    // Capital Basic
    {
      name: 'Capital Basic (Monthly)',
      slug: 'capital-basic-monthly',
      price: 10,
      active: true,
      currency: 'USD',
      invoice_period: 1,
```

#### `20240727094214_add_lemon_subscription_id_to_subscriptions_table.js`

```
exports.up = function (knex) {
  return knex.schema.table('subscription_plan_subscriptions', (table) => {
    table.string('lemon_subscription_id').nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.table('subscription_plan_subscriptions', (table) => {
    table.dropColumn('lemon_subscription_id');
  });
```

#### `20240728123419_add_trial_columns_to_subscription_table.js`

```
exports.up = function (knex) {
  return knex.schema.table('subscription_plan_subscriptions', (table) => {
    table.dateTime('trial_ends_at').nullable();
    table.dropColumn('cancels_at');
  });
};

exports.down = function (knex) {
  return knex.schema.table('subscription_plan_subscriptions', (table) => {
    table.dropColumn('trial_ends_at').nullable();
```

#### `20240819164614_create_oneclick_demos_table.js`

```
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('oneclick_demos', (table) => {
    table.increments('id');
    table.string('key');
    table.integer('tenant_id').unsigned();
    table.integer('user_id').unsigned();
```

#### `20240824151006_add_payment_status_to_subscriptions_table.js`

```
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.table('subscription_plan_subscriptions', (table) => {
    table.string('payment_status');
  });
```

#### `20240909091320_create_stripe_connect_accounts_table.js`

```
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('stripe_accounts', (table) => {
    table.increments('id').primary();
    table.string('stripe_account_id').notNullable();
    table.string('tenant_id').notNullable();
    table.timestamps(true, true); // Adds created_at and updated_at columns
```

#### `20240915070439_create_payment_links_table.js`

```
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('payment_links', (table) => {
    table.increments('id');
    table.integer('tenant_id');
    table.integer('resource_id');
    table.text('resource_type');
```

#### `20240928145627_add_logo_key_to_tenant_metadata.js`

```
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.table('tenants_metadata', (table) => {
    table.string('primary_color');
    table.string('logo_key');
    table.json('address');
  });
```

#### `20251102082642_create_api_keys_table.js`

```
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('api_keys', (table) => {
    table.increments();
    table.string('key').notNullable().unique().index();
    table.string('name');
    table
```

---

### Migrations — tenant (`packages/server/src/database/tenant/migrations/`)

- **Count:** 101 `*.ts` files.
- **Naming vs system:** Same **`YYYYMMDDHHMMSS_description`** prefix pattern, but files are **`.ts`** (TypeScript) rather than **`.js`**; newer files often include Knex JSDoc `@param { import("knex").Knex } knex` (system mix of plain and JSDoc styles).

**Filenames only (sorted):**

`20190822214303_create_accounts_table.ts`  
`20190822214304_create_items_categories_table.ts`  
`20190822214306_create_items_table.ts`  
`20190822214903_create_views_table.ts`  
`20190822214904_create_settings_table.ts`  
`20190822214905_create_views_columns.ts`  
`20190822214905_create_views_roles_table.ts`  
`20200104232644_create_contacts_table.ts`  
`20200104232647_create_accounts_transactions_table.ts`  
`20200105014405_create_expenses_table.ts`  
`20200105195823_create_manual_journals_table.ts`  
`20200105195825_create_manual_journals_entries_table.ts`  
`20200419171451_create_currencies_table.ts`  
`20200419191832_create_exchange_rates_table.ts`  
`20200423201600_create_media_table.ts`  
`20200503032011_create_media_links_table.ts`  
`20200606113848_create_expense_transactions_categories_table.ts`  
`20200713192127_create_sales_estimates_table.ts`  
`20200713213303_create_sales_receipt_table.ts`  
`20200715193633_create_sale_invoices_table.ts`  
`20200715194514_create_payment_receives_table.ts`  
`20200718161031_create_payment_receives_entries_table.ts`  
`20200719152005_create_bills_table.ts`  
`20200719153909_create_bills_payments_table.ts`  
`20200722164251_create_inventory_transactions_table.ts`  
`20200722164252_create_landed_cost_table.ts`  
`20200722164253_create_landed_cost_entries_table.ts`  
`20200722164255_create_inventory_transaction_meta_table.ts`  
`20200722173423_create_items_entries_table.ts`  
`20200728161617_create_bill_payments_entries.ts`  
`20200810121807_create_inventory_cost_lot_tracker_table.ts`  
`20200810121809_create_inventory_adjustments_table.ts`  
`20200810121810_create_inventory_adjustments_entries_table.ts`  
`20200810121910_create_cashflow_transactions_table.ts`  
`20210810121910_create_cashflow_transaction_lines_table.ts`  
`20210910121910_add_invoices_writtenoff_columns.ts`  
`20211012121910_add_costable_column_to_account_transactions.ts`  
`20211014121910_add_roles_table.ts`  
`20211112121920_create_users_table.ts`  
`20211122121920_create_credit_notes_table.ts`  
`20211122121920_create_vendor_credits_table.ts`  
`20211123121920_create_refund_transactions_table.ts`  
`20211124121920_create_credit_note_applies_invoices.ts`  
`20220124121920_create_branches_table.ts`  
`20220124121920_create_warehouses_table.ts`  
`20220125021920_create_items_warehouses_quantity.ts`  
`20220125121920_add_branch_column_to_accounts_transactions.ts`  
`20220125121920_add_branch_warehouse_columns_to_purchases.ts`  
`20220125121920_add_branch_warehouse_columns_to_sales.ts`  
`20220125121920_add_warehouse_column_to_inventory_transactions.ts`  
`20220125121920_add_warehouse_column_to_items_entries.ts`  
`20220128121920_add_exchange_rate_to_transactions.ts`  
`20220129121920_add_writtenoff_expense_account_to_invoices.ts`  
`20220229121920_rename_contacts_shipping_billing_addresses.ts`  
`20220329121920_add_cashflow_credit_account.ts`  
`20220329121920_add_seed_at_column_to_accounts.ts`  
`20220429121920_create_projects_table.ts`  
`20220429121922_add_project_id_to_expense_lines.ts`  
`20230405232607_drop_phone_number_from_users.ts`  
`20230810191606_create_tax_rates.ts`  
`20231004012644_add_tax_amount_withheld_to_bills_table.ts`  
`20231004020636_add_sell_purchase_tax_to_items_table.ts`  
`20231108170207_create_storage_table.ts`  
`20231202124014_change_item_entries_rate_to_float.ts`  
`20240201160214_create_plaid_items_Table.ts`  
`20240201235818_add_plaid_account_id_to_accounts_table.ts`  
`20240204180554_add_plaid_transaction_id_to_cashflow_transaction.ts`  
`20240228183404_create_uncateogrized_cashflow_transactions_table.ts`  
`20240304153926_add_uncategorized_transactions_column_to_accounts_table.ts`  
`20240308122047_add_uncategorized_transaction_id_to_cashflow_transactions.ts`  
`20240604153938_drop_storage_table.ts`  
`20240604153951_create_documents_table.ts`  
`20240604154005_create_documents_links_table.ts`  
`20240618100137_create_bank_rules_table.ts`  
`20240618171553_create_recognized_bank_transactions_table.ts`  
`20240618175241_add_recognized_transaction_id_to_uncategorized_transactins_table.ts`  
`20240619133733_create_matched_bank_transactions_table.ts`  
`20240620111308_add_excluded_column_to_uncategorized_cashflow_transactions_table.ts`  
`20240623154149_add_batch_column_to_uncategorized_cashflow_transactions_table.ts`  
`20240704064858_change_settings_value_to_text.ts`  
`20240709122347_move_cashflow_transaction_type_to_transaction_type_column.ts`  
`20240716114732_add_plaid_item_id_to_accounts_table.ts`  
`20240729172403_add_is_syncing_owner_to_accounts_table.ts`  
`20240801130829_change_tax_amount_withheld_column_precision_in_bills_and_sales_invoices_tables.ts`  
`20240804084709_create_paused_at_column_to_plaid_items_table.ts`  
`20240811121028_add_pending_column_to_uncategorized_transactions_table.ts`  
`20240909101051_add_stripe_pintent_id_to_payments_received.ts`  
`20240911112147_create_pdf_templates_table.ts`  
`20240915155403_payment_integration.ts`  
`20240915163722_creat_transaction_payment_service_table.ts`  
`20240915195024_seed_standard_pdf_templates.ts`  
`20241113113437_change_quantity_in_items_entries_to_decimal.ts`  
`20241128080734_add_discount_to_invoices_table.ts`  
`20241128081259_add_discount_to_estimates_table.ts`  
`20241128084550_add_discount_to_receipts_table.ts`  
`20241128085243_add_discount_to_bills_table.ts`  
`20241128090222_add_discount_to_credit_notes_table.ts`  
`20241128160604_add_discount_to_vendor_credits_table.ts`  
`20241211103019_add_discount_type_to_items_entries_table.ts`  
`20250326120000_add_contact_code_to_contacts.ts`  
`20260316000000_fix_account_type_typos.ts`

---

### Tenancy guard & CLS — `TenancyGlobal` / `App.module` / `organization-id`

#### `packages/server/src/modules/Tenancy/TenancyGlobal.guard.ts` (48 lines)

- **Purpose:** Global guard requiring the **`organization-id`** HTTP header unless the route is public, tenant-agnostic, or uses an auth API key pattern.
- **Functions/methods:** `TenantAgnosticRoute` factory (L15); `TenancyGlobalGuard.canActivate` (L26).
- **DB tables:** none.
- **Internal imports:** `lodash/isEmpty`; `@nestjs/common`; `@nestjs/core`; `../Auth/Auth.constants`; `../Auth/Auth.utils`.
- **TODO/FIXME/HACK:** none.

#### `packages/server/src/modules/App/App.module.ts` — `ClsModule.forRoot` block (L168–178)

```typescript
ClsModule.forRoot({
  global: true,
  middleware: {
    mount: true,
    setup: (cls: ClsService, req: Request, res: Response) => {
      cls.set('organizationId', req.headers['organization-id']);
    },
    generateId: true,
    saveReq: true,
  },
}),
```

- **Every `cls.set(...)` in this block:** **`cls.set('organizationId', req.headers['organization-id']);`** (single call).

#### Search **`organization-id`** (with hyphen) under `packages/server/src`

| File | Role |
|------|------|
| `modules/App/App.module.ts` | Writes CLS `organizationId` from `req.headers['organization-id']`. |
| `modules/Tenancy/TenancyGlobal.guard.ts` | Reads `request.headers['organization-id']`; enforces presence for protected routes. |
| `common/decorators/ApiCommonHeaders.ts` | Swagger header metadata `name: 'organization-id'`. |
| `modules/Subscription/Subscriptions.controller.ts` | Reads `req.headers['organization-id']` as `tenantId` (L66, L83). |

---

### Auth — backend files

#### `packages/server/src/modules/Auth/Auth.controller.ts` (169 lines)

- **Purpose:** Public auth HTTP API (sign-in/up, reset password, meta, register alias, impersonation cookie bootstrap).
- **Functions/methods:** `constructor` (L46); `signin` (L63); `signup` (L82); `register` (L93); `signupConfirm` (L107); `sendResetPassword` (L115); `resetPassword` (L124); `meta` (L138); `impersonate` (L152).
- **DB tables:** via models: `users`, `tenants` (through `tenantModel.query()`).
- **Internal imports:** Many `@nestjs/*`, `@nestjs/swagger`, `express`; `@/modules` style: `./guards/jwt.guard`, `./AuthApplication.sevice`, `./dtos/*`, `./commands/AuthSignin.service`, `../System/models/TenantModel`, `../System/models/SystemUser`, `../Tenancy/EnsureTenantIsInitialized.guard`, `../Tenancy/EnsureTenantIsSeeded.guards`.
- **TODO/FIXME/HACK:** none.

#### `packages/server/src/modules/Auth/Authed.controller.ts` (51 lines)

- **Purpose:** Authenticated auth endpoints (`/auth/signup/verify/resend`, `/auth/account`) under tenant-agnostic + user-not-verified bypass metadata.
- **Functions/methods:** `constructor` (L20); `resendSignupConfirm` (L36); `getAuthedAcccount` (L47) *(typo in method name)*.
- **DB tables:** indirect via services.
- **Internal imports:** `@nestjs/swagger`; `@nestjs/common`; `@nestjs/throttler`; `./queries/GetAuthedAccount.service`; `../Tenancy/TenancyGlobal.guard`; `./AuthApplication.sevice`; `./guards/EnsureUserVerified.guard`.
- **TODO/FIXME/HACK:** none.

#### `packages/server/src/modules/Auth/Auth.module.ts` (111 lines)

- **Purpose:** Wires Auth controllers, JWT/Passport, Bull queues, guards (`MixedAuthGuard`, `EnsureUserVerifiedGuard` as `APP_GUARD`), and auth services.
- **Functions/methods:** none (module class only).
- **DB tables:** none directly.
- **Internal imports:** extensive `@nestjs/*`, `@/modules/*`, `./strategies/Jwt.strategy` (note path), `./strategies/Local.strategy`, `./api-key/*`, etc.
- **TODO/FIXME/HACK:** none.

#### `packages/server/src/modules/Auth/commands/AuthSignup.service.ts` (144 lines)

- **Purpose:** Validates signup, creates tenant + system user, emits events, seeds CLS with ids/org.
- **Functions/methods:** `constructor` (L28); `signUp` (L42); `validateEmailUniqiness` (L97); `validateSignupRestrictions` (L112).
- **DB tables:** `users` (insert/query); implicit tenant creation via `TenantsManagerService`.
- **Internal imports:** `@/common/events/events`; `@/modules/Items/ServiceError`; `@/modules/System/models/SystemUser`; `@/modules/TenantDBManager/TenantsManager`; `nestjs-cls`; `./dtos/AuthSignup.dto`; `../Auth.interfaces`; `../Auth.constants`; `../Auth.utils`.
- **TODO/FIXME/HACK:** none.

#### `packages/server/src/modules/Auth/commands/AuthSignin.service.ts` (78 lines)

- **Purpose:** Email/password validation, JWT verification side-effects on CLS, token signing.
- **Functions/methods:** `constructor` (L12); `signin` (L25); `verifyPayload` (L50); `signToken` (L72).
- **DB tables:** `users` (queries by `email`).
- **Internal imports:** `nestjs-cls`; `@nestjs/common`; `@nestjs/jwt`; `@/modules/System/models/SystemUser`; `objection`; `../Auth.interfaces`; `../exceptions/*`.
- **TODO/FIXME/HACK:** none.

#### `packages/server/src/modules/Auth/Auth.interfaces.ts` (78 lines)

- **Purpose:** TypeScript interfaces for JWT payload shape, auth events, and DTO POJOs.
- **Functions/methods:** none.
- **DB tables:** none.
- **Internal imports:** `objection`; `../System/models/SystemUser`; `../System/models/TenantModel`; `./dtos/AuthSignup.dto`.
- **TODO/FIXME/HACK:** none.

#### `packages/server/src/modules/Auth/strategies/Jwt.strategy.ts` (24 lines)

- **Purpose:** Passport JWT strategy using bearer token extraction and configured secret.
- **Functions/methods:** `constructor` (L10); `validate` (L21).
- **DB tables:** none (delegates to `AuthSigninService.verifyPayload` which hits `users`).
- **Internal imports:** `@nestjs/common`; `@nestjs/passport`; `passport-jwt`; `../commands/AuthSignin.service`; `../Auth.interfaces`; `@nestjs/config`.
- **TODO/FIXME/HACK:** none.

#### `packages/server/src/modules/Auth/commands/AuthResetPassword.service.ts` (89 lines)

- **Purpose:** Validates reset token, updates `users.password`, deletes token rows, emits event.
- **Functions/methods:** `constructor` (L20); `resetPassword` (L37); `deletePasswordResetToken` (L85).
- **DB tables:** `password_resets`, `users`.
- **Internal imports:** `@nestjs/config`; `@nestjs/common`; `@/modules/System/models/SystemUser`; `../models/PasswordReset`; `@/modules/Items/ServiceError`; `../Auth.constants`; `../Auth.utils`; `@nestjs/event-emitter`; `@/common/events/events`; `../Auth.interfaces`.
- **TODO/FIXME/HACK:** **Uses `moment()` at L50 without importing `moment`** — likely **runtime `ReferenceError`** if this path executes.
- **Note:** Comment typo "tokne" L49.

#### `packages/server/src/modules/Auth/commands/AuthSendResetPassword.service.ts` (69 lines)

- **Purpose:** Creates password reset token row and emits mail-related events.
- **Functions/methods:** `constructor` (L19); `sendResetPassword` (L33); `deletePasswordResetToken` (L66).
- **DB tables:** `users`, `password_resets`.
- **Internal imports:** `@nestjs/common`; `../Auth.interfaces`; `@nestjs/event-emitter`; `../models/PasswordReset`; `@/modules/System/models/SystemUser`; `@/common/events/events`.

#### `packages/server/src/modules/Auth/commands/AuthSignupConfirmResend.service.ts` (41 lines)

- **Purpose:** Resend signup confirmation for the current CLS user if not verified.
- **Functions/methods:** `constructor` (L12); `signUpConfirmResend` (L25).
- **DB tables:** none direct queries (uses `TenancyContext.getSystemUser()`).
- **Internal imports:** `@nestjs/event-emitter`; `@nestjs/common`; `@/modules/System/models/SystemUser`; `@/modules/Items/ServiceError`; `../Auth.constants`; `@/common/events/events`; `../Auth.interfaces`; `@/modules/Tenancy/TenancyContext.service`.

#### `packages/server/src/modules/Auth/commands/AuthSignupConfirm.service.ts` (62 lines)

- **Purpose:** Confirms signup token and patches `users` verified fields.
- **Functions/methods:** `constructor` (L14); `signupConfirm` (L27).
- **DB tables:** `users`.
- **Internal imports:** `@/modules/Items/ServiceError`; `@/modules/System/models/SystemUser`; `@nestjs/common`; `../Auth.constants`; `@nestjs/event-emitter`; `../Auth.interfaces`; `@/common/events/events`.

#### `packages/server/src/modules/Auth/commands/AuthApiKeyAuthorization.service.ts` (50 lines)

- **Purpose:** Validates API key record and sets CLS tenant/org/user for subsequent handlers.
- **Functions/methods:** `constructor` (L8); `authorize` (L21).
- **DB tables:** `api_keys`, `tenants`.
- **Internal imports:** `@nestjs/common`; `../models/ApiKey.model`; `nestjs-cls`; `@/modules/System/models/TenantModel`.

#### `packages/server/src/modules/Auth/commands/GenerateApiKey.service.ts` (52 lines)

- **Purpose:** Inserts new `api_keys` row for current tenant/user; revoke helper.
- **Functions/methods:** `constructor` (L9); `generate` (L21); `revoke` (L45).
- **DB tables:** `api_keys` (via `ApiKeyModel.query()` / static `query()`).
- **Internal imports:** `@nestjs/common`; `crypto`; `../models/ApiKey.model`; `@/modules/Tenancy/TenancyContext.service`; `../Auth.constants`.

#### `packages/server/src/modules/Auth/queries/GetAuthMeta.service.ts` (22 lines)

- **Purpose:** Returns `{ signupDisabled }` from config.
- **Functions/methods:** `constructor` (L8); `getAuthMeta` (L17).
- **DB tables:** none.
- **Internal imports:** `@nestjs/common`; `@nestjs/config`; `../Auth.interfaces`.

#### `packages/server/src/modules/Auth/queries/GetAuthedAccount.service.ts` (21 lines)

- **Purpose:** Loads current system user via `TenancyContext` and transforms for API.
- **Functions/methods:** `constructor` (L8); `getAccount` (L13).
- **DB tables:** indirect (`TenancyContext` / user model).
- **Internal imports:** `@nestjs/common`; `@/modules/Tenancy/TenancyContext.service`; `@/modules/Transformer/TransformerInjectable.service`; `./GetAuthedAccount.transformer`.

#### `packages/server/src/modules/Auth/queries/GetApiKeys.service.ts` (29 lines)

- **Purpose:** Lists non-revoked API keys for current tenant.
- **Functions/methods:** `constructor` (L9); `getApiKeys` (L17).
- **DB tables:** `api_keys`.
- **Internal imports:** `@nestjs/common`; `../models/ApiKey.model`; `./GetApiKeys.transformer`; `@/modules/Transformer/TransformerInjectable.service`; `@/modules/Tenancy/TenancyContext.service`.

---

### Frontend — auth & HTTP

#### `packages/webapp/src/hooks/query/authentication.tsx` (155 lines)

- **Purpose:** React-query mutations for auth routes; on login success sets cookies and dispatches Redux batch updates.
- **Functions/methods:** `setAuthLoginCookies` (L29); `useAuthLogin` (L42); `useAuthRegister` (L76); `useAuthSendResetPassword` (L88); `useAuthResetPassword` (L100); `useAuthMetadata` (L112); `useAuthSignUpVerifyResendMail` (L130); `useAuthSignUpVerify` (L147).
- **DB tables:** none.
- **Internal imports:** `react-query`; `react-redux` (`batch`); `../useRequest`; `../../utils` (`setCookie`); `../useQueryRequest`; `./types`; `../state` (hooks).
- **Cookies written (`setAuthLoginCookies`):** **`token`**, **`authenticated_user_id`**, **`organization_id`**, **`tenant_id`** (L30–33). *(Commented optional `locale`.)*
- **Redux actions on login success (via hooks from `../state`):** dispatches **`setAuthToken`** → type `SET_AUTH_TOKEN`; **`setOrganizationId`** → `SET_ORGANIZATIOIN_ID`; **`setAuthTenantId`** → `SET_TENANT_ID`; **`setAuthUserId`** → `SET_USER_ID` (L56–61). **`setLogin` is not called** on this path.
- **HTTP headers:** uses `useAuthApiRequest` for unauthenticated POSTs — **no** auth/org headers added in that axios instance.
- **Where `organization-id` is stored after login:** Cookie **`organization_id`** and Redux **`authentication.organizationId`** (via `setOrganizationId`).
- **Where JWT is stored after login:** Cookie **`token`** (via `setCookie('token', data.access_token)` — snake_case from API) and Redux **`authentication.token`** via `setAuthToken(res.data.access_token)`.
- **TODO/FIXME/HACK:** none in code; `onSuccess` references **`args`** (L67) which is **not defined** in the mutation callback — likely a bug.

#### `packages/webapp/src/hooks/state/authentication.tsx` (147 lines)

- **Purpose:** Hooks wrapping Redux auth actions, cookie cleanup on logout, selectors.
- **Functions/methods:** `removeAuthenticationCookies` (L20); `useAuthActions` (L28); `useIsAuthenticated` (L51); `useAuthToken` (L58); `useAuthUser` (L65); `useAuthOrganizationId` (L72); `useAuthUserVerified` (L79); `useAuthUserVerifyEmail` (L87); `useSetAuthEmailConfirmed` (L94); `useSetOrganizationId` (L104); `useSetAuthToken` (L113); `useSetTenantId` (L122); `useSetAuthUserId` (L131); `useSetLocale` (L140).
- **DB tables:** none.
- **Internal imports:** `react-redux`; `react`; `@/store/authentication/authentication.reducer`; `@/store/authentication/authentication.actions`; `react-query`; `@/utils` (`removeCookie`).
- **Cookies removed on logout:** **`token`**, **`organization_id`**, **`tenant_id`**, **`authenticated_user_id`**, **`locale`** (L21–25).
- **Redux on logout:** **`setLogout` is not dispatched** — implementation clears cookies, clears react-query cache, **`window.location.reload()`** (L33–43). *(Commented `setStoreReset`.)*
- **TODO/FIXME/HACK:** none.

#### `packages/webapp/src/store/authentication/authentication.reducer.tsx` (86 lines)

- **Purpose:** Redux slice for auth; initial state **hydrated from cookies**; persisted reducer with **empty whitelist** (persist metadata only).
- **Reducer handlers:** `LOGIN_FAILURE`, `LOGIN_CLEAR_ERRORS`, `SET_EMAIL_VERIFIED`, `SET_AUTH_TOKEN`, `SET_ORGANIZATIOIN_ID` *(typo preserved)*, `SET_TENANT_ID`, `SET_USER_ID`, `RESET` (L29–73); exported helpers `isAuthenticated`, `hasErrorType`, tenant helpers (L78–86).
- **DB tables:** none.
- **Internal imports:** `@reduxjs/toolkit`; `redux-persist`; `redux-persist/es/purgeStoredState`; `redux-persist/lib/storage`; `lodash/isUndefined`; `@/utils` (`getCookie`); `@/store/types`.
- **TODO/FIXME/HACK:** none.

#### `packages/webapp/src/hooks/useRequest.tsx` (152 lines)

- **Purpose:** Default axios client with `/api/` prefix; attaches **Bearer JWT** and **`organization-id`** header from Redux state for authenticated calls; separate unauthenticated `useAuthApiRequest`.
- **Functions/methods:** `useApiRequest` (L12); `useAuthApiRequest` (L123); inner `get/post/update/put/patch/delete` helpers.
- **Outgoing headers (`useApiRequest` interceptor):** **`Authorization`** = ``Bearer ${token}`` when token present; **`organization-id`** = `organizationId` from Redux when present; **`Accept-Language`** = cookie `locale` or omitted (L31–40).
- **Cookies read:** **`locale`** via `getCookie('locale')` (L15).
- **TODO/FIXME/HACK:** none.

#### `packages/webapp/src/services/axios.tsx` (40 lines)

- **Purpose:** Legacy/global axios instance reading Redux `authentication.token` and **`authentication.organization`** into headers **`x-access-token`** and **`organization-id`** (plus hard-coded **`Accept-Language`: `'ar'`** overriding the earlier `'en'`).
- **DB tables:** none.
- **Internal imports:** `axios`; `@/store/createStore`.
- **Mismatch note:** reducer state uses **`organizationId`**, not **`organization`** — this interceptor may **never** send org id unless another reducer field exists.
- **TODO/FIXME/HACK:** large blocks of **commented** error-handling code (L31–37) — not `TODO` tokens.

#### `packages/webapp/src/hooks/query/useStockixOrgs.tsx` (59 lines)

- **Purpose:** Fetches Stockix org list from external `REACT_APP_STOCKIX_API_URL` public endpoint for sidebar switching.
- **Functions/methods:** `fetchStockixOrgs` (L20); `useStockixOrgs` (L48).
- **HTTP headers on `fetch`:** **`Accept: application/json`** only (L24).
- **Cookies / login / JWT:** none in this file.
- **Internal imports:** `react-query` only.
- **TODO/FIXME/HACK:** none.

#### `packages/webapp/src/containers/Dashboard/Sidebar/SidebarHead.tsx` (101 lines)

- **Purpose:** Sidebar organization menu; switches org via **`window.location.href`** to `publicUrl` or constructed subdomain URL when Stockix org list available.
- **Functions/methods:** `SidebarHeadJSX` (L19); exported `SidebarHead` (L99).
- **DB tables:** none.
- **Internal imports:** `@blueprintjs/core`; `@/components`; `@/containers/Organization/withCurrentOrganization`; `@/hooks/query`; `@/hooks/query/useStockixOrgs`; `@/utils`.
- **Cookies / Redux on org switch:** **none** in-file (full navigation).
- **TODO/FIXME/HACK:** none.

---

## Section 3 — Question answers

### Q1. System DB Knex config

**File that builds the system Knex instance:** `packages/server/src/modules/System/SystemDB/SystemDB.module.ts` — provider `SystemKnexConnection` calls **`Knex(knexConfig)`** at **lines 37–41**. Config object is built at **lines 16–34** from `ConfigService` keys under `systemDatabase.*`.

**Env vars** (registered in `packages/server/src/common/config/system-database.ts` **lines 3–11**):

| Knex field | Env vars |
|------------|----------|
| client | Fixed `'mysql'` — **line 4** (not from env) |
| host | `SYSTEM_DB_HOST` or `DB_HOST` — **line 5** |
| port | `SYSTEM_DB_PORT` or `DB_PORT` or default `5432` — **lines 5–6** *(defined in config but **not** passed into `connection` in `SystemDB.module.ts` **lines 18–24**)* |
| user | `SYSTEM_DB_USER` or `DB_USER` — **line 7** |
| password | `SYSTEM_DB_PASSWORD` or `DB_PASSWORD` — **line 8** |
| database | `SYSTEM_DB_NAME` or `DB_NAME` — **line 9** (mapped to Knex `connection.database` at `SystemDB.module.ts` **line 22**) |

**Separate instances:** **Yes.** System Knex: `SystemDB.module.ts`. Tenant Knex (per `organizationId`): `packages/server/src/modules/Tenancy/TenancyDB/TenancyDB.module.ts` **lines 25–43**. CLI duplicates both: `packages/server/src/modules/CLI/commands/BaseCommand.ts` **lines 13–57**.

---

### Q2. System DB host in Docker/env

| Source | Host value | Citation |
|--------|------------|----------|
| `docker-compose.prod.yml` — `server` service | **`DB_HOST=mysql`** (Compose service name) | **line 66** |
| `docker-compose.prod.yml` — `database_migration` | **`DB_HOST=mysql`** | **line 102** |
| `docker-compose.yml` (dev) | No app `DB_HOST`; MariaDB service only | **line 11** (`MYSQL_DATABASE=${SYSTEM_DB_NAME}`) |
| `packages/server/.env.example` | **`DB_HOST=localhost`** | **line 14** |

**External shared DB without code changes:** **Yes** — host/credentials/name are read from env in `system-database.ts` **lines 5–9**; runtime can set `DB_HOST` / `SYSTEM_DB_HOST` (and related vars) without editing application source.

---

### Q3. POST /auth/signin response shape

**Handler return (in-memory, camelCase):** `packages/server/src/modules/Auth/Auth.controller.ts` **lines 70–75**: `accessToken`, `organizationId`, `tenantId`, `userId`.

**HTTP JSON body (wire format, snake_case):** Global `SerializeInterceptor` applies **`camelToSnake`** on outbound responses — `packages/server/src/common/interceptors/serialize.interceptor.ts` **lines 52–54**, **71–72**.

| Exact response key | Source |
|--------------------|--------|
| **`access_token`** | `AuthSigninService.signToken(user)` — `Auth.controller.ts` **line 71** |
| **`organization_id`** | `tenant.organizationId` — **line 72** |
| **`tenant_id`** | `tenant.id` — **line 73** |
| **`user_id`** | `user.id` — **line 74** |

**Serializer:** `packages/server/src/common/interceptors/serialize.interceptor.ts` (`SerializeInterceptor`, `DEFAULT_STRATEGY.out` = `camelToSnake`).

---

### Q4. setAuthLoginCookies — exact cookies

**Definition:** `packages/webapp/src/hooks/query/authentication.tsx` **lines 29–37**.

| Cookie name (exact key) | Value | Line |
|-------------------------|-------|------|
| **`token`** | `data.access_token` | **30** |
| **`authenticated_user_id`** | `data.user_id` | **31** |
| **`organization_id`** | `data.organization_id` | **32** |
| **`tenant_id`** | `data.tenant_id` | **33** |

**Options** (`packages/webapp/src/utils/index.tsx` **lines 22–24**): `jsCookie.set(name, value, { expires: expiry, path: '/', secure })` — default **`expires: 365`** days, **`secure: false`**, **`path: '/'`**. **No `domain`** is set.

---

### Q5. organization-id flow after login

1. **Sign-in response** includes **`organization_id`** (snake_case JSON) — `Auth.controller.ts` **line 72** (serialized at wire).
2. **`setAuthLoginCookies`** writes cookie **`organization_id`** — `authentication.tsx` **line 32**.
3. **`useAuthLogin` `onSuccess`** dispatches **`setOrganizationId(res.data.organization_id)`** — `authentication.tsx` **lines 56–60** → Redux `authentication.organizationId` — `authentication.reducer.tsx` **lines 56–60** (action `SET_ORGANIZATIOIN_ID`).
4. **Initial page load:** reducer reads **`getCookie('organization_id')`** — `authentication.reducer.tsx` **lines 11–15**.
5. **Outgoing API requests:** `useRequest.tsx` sets **`request.headers['organization-id'] = organizationId`** from Redux — **lines 20–21**, **35–36**.

**Storage summary:** **cookie** (`organization_id`) + **Redux** (`authentication.organizationId`). **Not** persisted via `redux-persist` whitelist (empty) — `authentication.reducer.tsx` **line 25**.

---

### Q6. Route guards inventory

**Global guards (all non-public routes):** `MixedAuthGuard` — `Auth.module.ts` **lines 100–103**; `EnsureUserVerifiedGuard` — **lines 104–107**; `TenancyGlobalGuard` — `Tenancy.module.ts` **lines 13–16**; `EnsureTenantIsInitializedGuard` — **lines 17–20**; `EnsureTenantIsSeededGuard` — **lines 21–24**; `TenancyInitializeModelsGuard` — **lines 25–28**.

**`Auth.controller.ts`:** class `@PublicRoute()` — **line 43** → JWT skipped — `jwt.guard.ts` **lines 24–26**; `organization-id` skipped when public — `TenancyGlobal.guard.ts` **lines 40–42**.

| Route | Method | Guard | JWT required | org-id required |
|-------|--------|-------|-------------|-----------------|
| `/auth/signin` | POST | `@PublicRoute()` (class); `@UseGuards(LocalAuthGuard)` — **lines 43, 54–55**; `@Throttle` — **44** | No | No |
| `/auth/signup` | POST | `@PublicRoute()`; `@Throttle` | No | No |
| `/auth/register` | POST | `@PublicRoute()`; `@Throttle` | No | No |
| `/auth/signup/verify` | POST | `@PublicRoute()`; `@Throttle` | No | No |
| `/auth/send_reset_password` | POST | `@PublicRoute()`; `@Throttle` | No | No |
| `/auth/reset_password/:token` | POST | `@PublicRoute()`; `@Throttle` | No | No |
| `/auth/meta` | GET | `@PublicRoute()`; `@Throttle` | No | No |
| `/auth/impersonate` | GET | `@PublicRoute()`; `@IgnoreTenantInitializedRoute` **147**; `@IgnoreTenantSeededRoute` **148**; `@Throttle` | No | No |

**`Authed.controller.ts`:** `@TenantAgnosticRoute()` — **line 16** (org-id not required); `@IgnoreUserVerifiedRoute()` — **line 17**; no `@PublicRoute()` → JWT via `MixedAuthGuard` — `MixedAuth.guard.ts` **lines 14–22**.

| Route | Method | Guard | JWT required | org-id required |
|-------|--------|-------|-------------|-----------------|
| `/auth/signup/verify/resend` | POST | `@TenantAgnosticRoute()`; `@IgnoreUserVerifiedRoute()`; global `MixedAuthGuard`, `EnsureUserVerifiedGuard` (skipped), tenancy guards (tenant-agnostic skips org + init/seed where applicable) | Yes | No |
| `/auth/account` | GET | Same as above | Yes | No |

---

### Q7. Existing multi-org code

| Search term | Result |
|-------------|--------|
| `userOrganizations` | **no matches found** under `packages/server/src` |
| `userTenants` | **no matches found** |
| `user_tenants` | **no matches found** |
| `memberships` | **no matches found** |
| `organizations` (substring) | `Organization/dtos/GetCurrentOrganizationResponse.dto.ts` **line 77**; `Organization/dtos/Organization.dto.ts` **line 172** (Swagger example strings only) |

**Model:** `SystemUser.tenantId` — single FK — `System/models/SystemUser.ts` **line 11**. No join table for multiple orgs per user in application code.

---

### Q8. Cross-tenant access — verification gap

**Trace (JWT-authenticated request to a protected, non-tenant-agnostic route):**

1. **`MixedAuthGuard`** → **`JwtAuthGuard`** — `MixedAuth.guard.ts` **lines 14–22**.
2. **`JwtStrategy.validate`** → **`AuthSigninService.verifyPayload`** — `Jwt.strategy.ts` **lines 21–22**.
3. **`verifyPayload`** loads `users` by email (`payload.sub`), sets CLS **`tenantId`**, **`userId`** only — `AuthSignin.service.ts` **lines 54–60**. Does **not** read or validate **`organization-id`** header.
4. **CLS middleware** sets **`organizationId`** from **`req.headers['organization-id']`** — `App.module.ts` **lines 172–173** (independent of step 3).
5. **`TenancyGlobalGuard`** requires header present (unless public / tenant-agnostic / API key) — `TenancyGlobal.guard.ts` **lines 28–45**.
6. **`TenancyContext.getTenant`** resolves tenant by **`organizationId` from CLS** — `TenancyContext.service.ts` **lines 26–31**: `TenantModel.query().findOne({ organizationId })`.

**Verification gap:** **No** step compares **`users.tenant_id`** (from JWT/CLS) to the tenant row for **`organization-id`**. **No** join query cited that proves the authenticated user may access that org.

---

### Q9. Invite flow

| Step | File | Lines | Behavior |
|------|------|-------|----------|
| Create tenant user | `UsersModule/commands/InviteUser.service.ts` | **51–57** | **`insertAndFetch`** new tenant **`users`** row (email, roleId, active, invitedAt) |
| Sync system user + invite | `UsersModule/subscribers/SyncSystemSendInvite.subscriber.ts` | **36–59** | **`insert`** new system **`users`** row; **`tenantId`** = inviter `authorizedUser.tenantId` (**37–38, 44**); **`user_invites`** row (**50–55**); link **`systemUserId`** on tenant user (**57–59**) |
| Accept invite | `UsersModule/commands/AcceptInviteUser.service.ts` | **62–68** | **`updateAndFetchById(inviteToken.userId, ...)`** on existing system user (reuse row) |
| Public HTTP | `UsersModule/UsersInvitePublic.controller.ts` | **18–22**, **34–35** | accept / check invite |

**Reuses vs new row:** Invite creates **new** system `users` row on send (**SyncSystemSendInvite.subscriber.ts` 41–48**). Accept **updates** that row (**AcceptInviteUser.service.ts` 62–68**). **`tenantId`** on system user = inviting admin’s tenant (**SyncSystemSendInvite.subscriber.ts` 37–38, 44**).

---

### Q10. Existing auth tests

**Search:** `packages/server/src/modules/Auth/**/*.spec.ts` and `**/*.test.ts`.

**Result:** **none found** (0 files).

**Line counts / coverage:** N/A.

---

## Section 4 — Ready-state checklist

| Item | Status | File | Notes |
|------|--------|------|-------|
| System Knex config | found | `packages/server/src/modules/System/SystemDB/SystemDB.module.ts` (lines 16–41); `packages/server/src/common/config/system-database.ts` (lines 3–11) | Separate from tenant Knex in `TenancyDB.module.ts` |
| System DB env vars documented | partial | `packages/server/.env.example` (lines 13–25); `system-database.ts` (lines 5–9) | `SYSTEM_DB_HOST` not in `.env.example` (falls back to `DB_HOST`); `port` in config but not wired into Knex `connection` in `SystemDB.module.ts` |
| users migration exists | yes | `packages/server/src/database/system/migrations/20200420134633_create_users_table.js` | System DB `users` table |
| tenants migration exists | yes | `packages/server/src/database/system/migrations/20200420134631_create_tenants_table.js` | Defines `organization_id` column |
| user_tenants migration exists | no | — | must create |
| UserTenant model exists | no | — | must create |
| JWT payload has org fields | no | `packages/server/src/modules/Auth/commands/AuthSignin.service.ts` (lines 72–76) | `signToken` sets only `sub` (email); no `organizationId` / `tenantId` in JWT |
| TenancyGlobal guard checks membership | no | `packages/server/src/modules/Tenancy/TenancyGlobal.guard.ts` (lines 26–46) | Checks header **presence** only, not user↔tenant membership |
| switch-tenant route exists | no | — | must create |
| my-tenants route exists | no | — | must create |
| internal attach-user route exists | no | — | must create |
| Frontend stores org-id in cookie | yes | `packages/webapp/src/hooks/query/authentication.tsx` (lines 32); `authentication.reducer.tsx` (lines 11–15) | Cookie key `organization_id`; also Redux |
| Frontend useSwitchTenant hook exists | no | — | must create |
| SidebarHead uses API switch | no | `packages/webapp/src/containers/Dashboard/Sidebar/SidebarHead.tsx` (lines 47–58) | Uses `window.location.href` to `publicUrl` or subdomain; optional list from `useStockixOrgs` (external Stockix API) |

---

## Section 5 — Blockers and open questions

1. **No `user_tenants` table or `UserTenant` model** — Cannot represent one login across multiple orgs until migration + model exist (checklist: must create). All invite/signup paths bind **one** `users.tenant_id` per system user (`SystemUser.ts` line 11; `SyncSystemSendInvite.subscriber.ts` lines 41–44).

2. **JWT carries no org/tenant claims** — `signToken` only sets `sub` (`AuthSignin.service.ts` lines 72–76). Phase 1 must decide whether org context stays header-only, moves into JWT, or both—and how `verifyPayload` and guards stay consistent.

3. **No server-side membership check for `organization-id`** — Header is copied to CLS (`App.module.ts` lines 172–173) and used to open tenant DB (`TenancyContext.service.ts` lines 26–31) without verifying `users.tenant_id` matches that tenant (`Q8`). This is a **security design decision** before multi-org: add membership guard or accept risk on mis-sent headers.

4. **System DB `port` env unused in Knex connection** — `system-database.ts` lines 5–6 define `port`; `SystemDB.module.ts` lines 18–24 omit it. Must decide default MySQL port (3306) vs documented default `5432` in config when deploying external DB.

5. **No `switch-tenant`, `my-tenants`, or `internal attach-user` routes** — Not present in codebase (grep under `packages/`). Phase 1 API contract (paths, auth, response shape) must be specified before implementation.

6. **Frontend org switch is navigation-only** — `SidebarHead.tsx` lines 47–58 change host via `window.location`; no cookie/Redux update + API switch hook. Must decide whether multi-org UX reuses Stockix `useStockixOrgs` external list or new finance API (`useStockixOrgs.tsx` lines 20–25: separate `REACT_APP_STOCKIX_API_URL`).

7. **Legacy `services/axios.tsx` may not send org header** — Reads `state.authentication.organization` (`axios.tsx` lines 9–16) but reducer uses `organizationId` (`authentication.reducer.tsx` lines 11–15). Any code path still using default `http` export may omit `organization-id` unless verified per call site.

8. **Known defects in existing auth code (document only)** — `AuthResetPassword.service.ts` line 50 uses `moment()` without import; `authentication.tsx` line 67 references undefined `args` in `onSuccess`. Phase 1 should fix or avoid these paths when touching auth.

9. **Zero auth module tests** — No `*.spec.ts` / `*.test.ts` under `modules/Auth/`. Phase 1 acceptance criteria need a test strategy (signin, guards, membership) with no baseline coverage.

10. **`Auth.controller` impersonate cookie vs login cookies** — `impersonate` sets `token` cookie with `httpOnly: false`, `maxAge` 1h (`Auth.controller.ts` lines 161–166) vs `setAuthLoginCookies` 365-day defaults (`utils/index.tsx` line 22). Stockix provisioning flow must not assume identical cookie semantics across both entry points.

---
