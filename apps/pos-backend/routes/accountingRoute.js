const express = require("express");
const { authedTenantLocation } = require("../middlewares/tenantRouteStacks");
const ac = require("../middlewares/backofficeAccounting");
const ctrl = require("../controllers/accountingController");
const notificationsCtrl = require("../controllers/backofficeNotificationController");
const { uploadBankCsv } = require("../middlewares/uploadBankCsv");
const { requireAccountingDirectMode } = require("../middlewares/requireAccountingDirectMode");

const router = express.Router();

/** Role-agnostic: accountant roles use backoffice.accounting.* without being admin/manager. */
const rd = [...authedTenantLocation, ac.requireAccountingRead];
const wr = [...authedTenantLocation, ac.requireAccountingWrite];

const arRd = [...authedTenantLocation, ac.requireArRead];
const arWr = [...authedTenantLocation, ac.requireArWrite];
const apRd = [...authedTenantLocation, ac.requireApRead];
const apWr = [...authedTenantLocation, ac.requireApWrite];
const glRd = [...authedTenantLocation, ac.requireGlRead];
const glWr = [...authedTenantLocation, requireAccountingDirectMode, ac.requireGlWrite];
const bankRd = [...authedTenantLocation, ac.requireBankRead];
const bankWr = [...authedTenantLocation, ac.requireBankWrite];
const periodWr = [...authedTenantLocation, ac.requirePeriodsWrite];
const expensesRd = [...authedTenantLocation, ac.requireExpensesRead];
const expensesWr = [...authedTenantLocation, ac.requireExpensesWrite];
const expensesApprove = [...authedTenantLocation, ac.requireExpensesApprove];
const approvalsRd = [...authedTenantLocation, ac.requireApprovalsRead];
const approvalsWr = [...authedTenantLocation, ac.requireApprovalsWrite];
const consolidatedRd = [...authedTenantLocation, ac.requireConsolidatedRead];

router.post("/ensure-defaults", ...wr, ctrl.ensureDefaults);
router.get("/accounts", ...rd, ctrl.listAccounts);
router.post("/accounts", ...wr, ctrl.createAccount);
router.patch("/accounts/:id", ...wr, ctrl.updateAccount);
router.get("/config", ...rd, ctrl.getConfig);
router.put("/config", ...wr, ctrl.updateConfig);
router.get("/journal-entries", ...glRd, ctrl.listJournalEntries);
router.get("/journal-entries/:id", ...glRd, ctrl.getJournalEntry);
router.post("/journal-entries", ...glWr, ctrl.postManualJournal);
router.get("/trial-balance", ...glRd, ctrl.trialBalance);
router.get("/reports/pnl", ...glRd, ctrl.profitAndLoss);
router.get("/reports/cash-flow", ...glRd, ctrl.cashFlowReport);
router.get("/reports/balance-sheet", ...glRd, ctrl.balanceSheet);
router.get("/reports/consolidated/trial-balance", ...consolidatedRd, ctrl.consolidatedTrialBalanceReport);
router.get("/reports/consolidated/pnl", ...consolidatedRd, ctrl.consolidatedProfitAndLossReport);
router.get("/reports/consolidated/balance-sheet", ...consolidatedRd, ctrl.consolidatedBalanceSheetReport);
router.get("/consolidation/child-organizations", ...consolidatedRd, ctrl.listConsolidationChildOrganizations);
router.get("/reports/budget-vs-actual", ...glRd, ctrl.budgetVsActual);
router.get("/reports/ar-aging", ...arRd, ctrl.arAging);
router.get("/reports/customer-statement", ...arRd, ctrl.customerStatement);
router.get("/reports/customer-statement.pdf", ...arRd, ctrl.customerStatementPdf);
router.get("/reports/supplier-statement", ...apRd, ctrl.supplierStatement);
router.get("/reports/supplier-statement.pdf", ...apRd, ctrl.supplierStatementPdf);
router.get("/reports/session-summary", ...rd, ctrl.sessionSummary);
router.get("/export/journals.csv", ...glRd, ctrl.exportJournalsCsv);
router.get("/export/journals.pdf", ...glRd, ctrl.exportJournalsPdf);
router.get("/export/integration.json", ...glRd, ctrl.exportIntegrationJson);
router.get("/export/trial-balance.xlsx", ...glRd, ctrl.exportTrialBalanceXlsx);
router.get("/export/trial-balance.pdf", ...glRd, ctrl.exportTrialBalancePdf);
router.get("/audit-log", ...rd, ctrl.listAuditLogs);
router.post("/sync/ack", ...wr, ctrl.acknowledgeSync);
router.get("/notifications", ...rd, notificationsCtrl.listBackofficeNotifications);
router.get("/notifications/unread-count", ...rd, notificationsCtrl.getBackofficeUnreadNotificationCount);
router.post("/notifications/all/read", ...wr, notificationsCtrl.markAllBackofficeNotificationsRead);
router.post("/notifications/:id/read", ...wr, notificationsCtrl.markBackofficeNotificationRead);
router.post("/post-order/:orderId", ...wr, ctrl.repostOrder);
router.post("/reverse-order/:orderId", ...wr, ctrl.reverseOrder);
router.post("/refunds/:orderId", ac.requireOrderRefundAdmin, ...wr, ctrl.postRefund);
router.post("/ar/payments", ...arWr, ctrl.postArPayment);
router.get("/fx/rates", ...rd, ctrl.listFxRates);
router.post("/fx/rates", ...wr, ctrl.createFxRate);
router.patch("/fx/rates/:id", ...wr, ctrl.updateFxRate);
router.delete("/fx/rates/:id", ...wr, ctrl.deleteFxRate);
router.get("/fx/resolve", ...rd, ctrl.resolveFx);
router.post(
  "/inventory/bootstrap-cost-layers",
  ...wr,
  ctrl.bootstrapCostLayers
);
router.get("/periods", ...rd, ctrl.listPeriods);
router.post("/periods/close", ...periodWr, ctrl.closePeriod);
router.post(
  "/closing/retained-earnings",
  ...periodWr,
  ctrl.postRetainedEarningsClosing
);
router.get("/invoices", ...arRd, ctrl.listInvoices);
router.post("/invoices/from-order/:orderId", ...arWr, ctrl.createInvoiceFromOrder);
router.patch("/invoices/:id/void", ...arWr, ctrl.voidInvoice);
router.get("/sessions", ...rd, ctrl.listSessions);
router.post("/sessions/open", ...wr, ctrl.openSession);
router.post("/sessions/:id/close", ...wr, ctrl.closeSession);
router.get("/gift-cards", ...arRd, ctrl.listGiftCards);
router.post("/gift-cards/issue", ...wr, ctrl.issueGiftCard);
router.post("/gift-cards/redeem", ...wr, ctrl.redeemGiftCard);
router.get("/bank/statements", ...bankRd, ctrl.listBankStatements);
router.post("/bank/match", ...bankWr, ctrl.matchBankLine);
router.get("/bank/match-suggestions/:id", ...bankRd, ctrl.getBankMatchingSuggestions);
router.get("/bank/reconciliation-report", ...bankRd, ctrl.getBankReconciliationReport);
router.post("/bank/statements/import", ...wr, uploadBankCsv, ctrl.importBankStatementsCsv);

router.get("/accounts/:id/ledger", ...glRd, ctrl.accountLedger);

router.get("/recurring-templates", ...glRd, ctrl.listRecurringTemplates);
router.post("/recurring-templates", ...glWr, ctrl.createRecurringTemplate);
router.patch("/recurring-templates/:id", ...glWr, ctrl.updateRecurringTemplate);
router.delete("/recurring-templates/:id", ...glWr, ctrl.deleteRecurringTemplate);
router.post("/recurring-templates/:id/run", ...glWr, ctrl.runRecurringTemplate);

router.get("/budgets", ...glRd, ctrl.listBudgets);
router.post("/budgets", ...glWr, ctrl.createBudget);
router.patch("/budgets/:id", ...glWr, ctrl.updateBudget);
router.delete("/budgets/:id", ...glWr, ctrl.deleteBudget);

router.get("/recurring-invoices", ...arRd, ctrl.listRecurringInvoices);
router.post("/recurring-invoices", ...arWr, ctrl.createRecurringInvoiceTemplate);
router.post("/recurring-invoices/preview", ...arRd, ctrl.previewRecurringInvoice);
router.patch("/recurring-invoices/:id", ...arWr, ctrl.updateRecurringInvoiceTemplate);
router.delete("/recurring-invoices/:id", ...arWr, ctrl.deleteRecurringInvoiceTemplate);
router.post("/recurring-invoices/:id/run", ...arWr, ctrl.runRecurringInvoice);
router.post("/automation/run", ...wr, ctrl.runAutomationHooks);
router.post("/automation/test-webhook", ...wr, ctrl.testAutomationWebhook);

const vbc = require("../controllers/vendorBillController");

/** Accounts payable (vendor bills) — canonical vendor bill routes plus AP alias for integrations. */
router.get("/accounts-payable", ...apRd, vbc.listVendorBills);
router.get("/accounts-payable/:id", ...apRd, vbc.getVendorBill);
router.get("/vendor-bills", ...apRd, vbc.listVendorBills);
router.get("/vendor-bills/:id", ...apRd, vbc.getVendorBill);
router.post("/vendor-bills/from-po", ...apWr, vbc.createVendorBillFromPO);
router.post("/vendor-bills/:id/post", ...apWr, vbc.postVendorBill);
router.post("/vendor-bills/:id/payments", ...apWr, vbc.recordPayment);
router.post("/vendor-bills/:id/void", ...apWr, vbc.voidVendorBill);

const cnc = require("../controllers/creditNoteController");

router.get("/credit-notes", ...arRd, cnc.listCreditNotes);
router.get("/credit-notes/:id", ...arRd, cnc.getCreditNote);
router.post("/credit-notes", ...arWr, cnc.issueCreditNote);

const erc = require("../controllers/expenseReportController");
const arc = require("../controllers/approvalRequestController");

router.get("/expense-reports", ...expensesRd, erc.listExpenseReports);
router.get("/expense-reports/:id", ...expensesRd, erc.getExpenseReport);
router.post("/expense-reports", ...expensesWr, erc.createExpenseReport);
router.patch("/expense-reports/:id", ...expensesWr, erc.updateExpenseReport);
router.post("/expense-reports/:id/submit", ...expensesWr, erc.submitExpenseReport);
router.post("/expense-reports/:id/approve", ...expensesApprove, erc.approveExpenseReportDirect);
router.post("/expense-reports/:id/reject", ...expensesApprove, erc.rejectExpenseReportDirect);
router.post("/expense-reports/:id/post-gl", ...glWr, erc.postExpenseReportGl);

router.get("/approval-requests", ...approvalsRd, arc.listApprovalRequests);
router.post("/approval-requests", ...approvalsWr, arc.createApprovalRequest);
router.post("/approval-requests/:id/approve", ...approvalsWr, arc.approveApprovalRequest);
router.post("/approval-requests/:id/reject", ...approvalsWr, arc.rejectApprovalRequest);

module.exports = router;
