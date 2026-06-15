Accounting

Core

Chart of accounts (create/edit accounts)
Journal entries (manual + auto-post from POS sales)
AccountingConfig — wire GL accounts to tenders, taxes, payment methods
Auto post on paid (sales journal)
Tax rate mapping → payable accounts
Payment method → GL account mapping
Cash register sessions (open/close, Z-report)
Trial balance
P&L
Fiscal periods (open/close)

Addons

Auto post COGS on paid
Balance sheet
Cash flow report
Budget vs actual + budget management
AR — invoices, payments, credit notes, aging
Recurring invoices
AP — vendor bills, payments, 3-way match
Gift cards (liability tracking)
FX rates + multi-currency
Recurring journals (depreciation, rent accrual)
Retained earnings closing
Bank statement import + matching (reconciliation)
GL exports (CSV/XLSX/PDF/JSON)
Audit log
Order GL tools (repost/reverse/refund repair)



ACCOUNTING — Core
Chart of accounts
You open a new café. Before anything posts, you create accounts: 4000 Sales, 2000 VAT Payable, 1010 Cash, 1020 Card Clearing, 5000 Food Cost. Without these buckets, nothing has anywhere to land.
Journal entries (manual + auto)
Friday night 300 tickets get paid — all 300 automatically post debit Card Clearing / credit Sales + VAT. Monday your accountant spots a $200 miscategorized expense and manually posts a correcting entry.
AccountingConfig
You tell the system: cash sales → account 1010, card sales → account 1020, VAT 11% → account 2000. This is done once. Every sale after that routes itself correctly without touching it again.
Auto post on paid
Lunch rush, 80 orders in 2 hours. Nobody types anything into a ledger. The moment the cashier hits "paid," the journal writes itself.
Tax rate mapping
Lebanon has VAT at 11%. You map that tax code to account 2000. Every sale with VAT on it automatically credits 2000 — when you file with the government, the number is already sitting there.
Payment method → GL mapping
Cash goes to 1010 Till Asset. Visa goes to 1020 Card Clearing. Online orders go to 1030 Stripe Clearing. Each tender settles to the right account without manual sorting.
Cash register sessions
Cashier opens shift with $200 float. End of day they count $847 physical cash. System expected $850. The $3 short is logged, session closes, manager signs off.
Trial balance
End of March your accountant runs the TB. Every account shows its debit and credit total. Total debits = total credits. If they don't, something was posted wrong and you find it before the auditor does.
P&L
April was slow. You pull P&L: Revenue $42,000, Food Cost $14,000, Labor $12,000, Rent $4,000, Net $12,000. You compare to April last year and see margins dropped 4% — menu prices haven't kept up with ingredient costs.
Fiscal periods
January is closed. Your bookkeeper can't accidentally post a "correction" into January in March and mess up already-filed VAT returns.

ACCOUNTING — Addons
Auto post COGS on paid
Every paid burger simultaneously debits Food Cost Expense and credits Inventory. Month-end food cost % is automatically accurate — no manual spreadsheet reconciliation.
Balance sheet
Bank asks for financials before approving a loan. You export the balance sheet: Cash $18k, Equipment $40k, AP $6k, Equity $52k. Done in 30 seconds.
Cash flow report
P&L looks profitable but you're almost out of cash. Cash flow report shows why: you paid 3 supplier invoices upfront while corporate clients haven't paid their AR yet.
Budget vs actual
You budgeted $8,000 food cost for May. Actual came in at $10,200. You investigate and find a supplier raised chicken prices mid-month without notice.
AR — invoices, payments, credit notes, aging
A corporate client orders catering for 10 events on account. You invoice each event. After 45 days two invoices are unpaid. AR aging flags them. You call the client.
Recurring invoices
A school pays you $3,000/month for lunch service. Invoice generates automatically on the 1st. You never forget to bill them.
AP — vendor bills, payments
Your produce supplier sends a $1,200 invoice. You post it as a vendor bill. At end of month you run AP and pay all outstanding bills in one batch. No invoice gets missed or double-paid.
Gift cards
You sell $500 worth of gift cards in December. That $500 sits as a liability on your balance sheet — it's not revenue yet because no food was delivered. When customers redeem them in January, liability drops and revenue goes up.
FX rates
You invoice a Dubai hotel group in AED. Your books are in USD. The system converts at the day's rate and tracks the FX gain or loss when the rate moves between invoice date and payment date.
Recurring journals
Every month on the 1st the system automatically posts: Debit Rent Expense $2,500 / Credit Rent Payable $2,500. Your accountant doesn't touch it.
Retained earnings closing
End of fiscal year you close the books. The system rolls net income into retained earnings equity account, zeroing out all P&L accounts for the new year.
Bank statement import + matching
You download your bank CSV and import it. The system matches 90% of lines to existing GL entries automatically. You manually match the remaining 5 lines. Bank rec done in 20 minutes instead of 3 hours.
GL exports
Your external accountant uses Xero. Every month you export journals as CSV and send it over. Until you build a native sync, this is the bridge.
Audit log
Your controller notices a journal was deleted. Audit log shows: user "rami@staff" deleted entry JE-0441 on March 3rd at 11:42pm. You have your answer.
Order GL tools
POS crashed mid-settlement. Order shows "paid" but no journal was created. You use the repost tool after confirming the order data is clean. One click, journal created, books balanced.


