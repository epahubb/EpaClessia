# Finance officer workspace redesign

## Deploy
Back up the database. Deploy both frontend and server from this complete archive using the existing environment variables and database. The prior member, ministry, group, security, portrait and staff-dues updates are retained. Existing startup migrations add nullable dues metadata fields as needed; do not delete or recreate your church. No new dependencies, credentials or provider changes are required.

Assign the account the FINANCE / Finance Officer role in Users & Permissions, then sign in again. Its landing page is /finance/dashboard. Church administrators and pastors may also use the finance workspace. Finance officers still cannot administer members, users or church settings.

## Navigation
- Overview: selected-period, currency-separated collected giving + dues, paid expenses and net cash movement; daily chart; income breakdown; quick links; overdue invoices/pledges and unpaid-expense attention panels; current-year budget pulse; recent transactions.
- Transaction ledger: giving + dues + expenses, name/purpose/reference search, date/type/status/currency filters, 25-row paging, formula-safe CSV export and print/save-PDF. Print and export use the current filters and include all matching loaded rows, not just the visible page.
- Giving & offerings: record completed cash/bank/mobile-money/card/cheque gifts, with traceable method-specific references and optional ministry tagging.
- Member dues: schedules and staff payment recording, preserved retry protection and member dues history.
- Pledges, expenses, budgets and inventory: dedicated searchable registers with their existing create/edit workflows.
- Reports & receipts: statements, tithes, giving receipts, expense registers, forecasts, budget/pledge snapshots, dues reports and completed-dues receipts.
- Church invoices: create invoices and manage paid/void state. An invoice marked paid is not automatically a donation or collected giving record.
- Charges & billing: subscription invoices and platform service-charge remittances.
- Giving purposes: church-defined giving/pledge purpose names.

The desktop sidebar, mobile drawer, church identity, dark/light modes and task-focused pages replace the old two-item finance navigation and long tab strip. Finance modules load only the option lists they need. Dashboard report/ledger links carry the selected UTC date range. General registers show all dates; use the transaction ledger for period filters.

## Financial interpretation
- Completed dues now appear once in period cash totals, statements and forecasts; pending dues do not. Dues are not copied into donations.
- Only expenses marked paid reduce cash movement. Approved/pending expenses remain commitments. Pledges and issued invoices are not cash income.
- Currencies remain separate; no foreign-exchange conversion is performed. Offline giving, expenses, pledges and dues schedules accept uppercase three-letter currencies. Online dues must match the configured gateway currency or the member is directed to the finance office.
- Budget amounts/spent values are manually maintained GHS snapshots, not automatically reconciled against expenses. Pledge snapshots and current-year budget panels are not filtered by the transaction date range. Attention invoice/expense panels reflect the selected period, not all historical invoices.
- This is church finance management, not a certified double-entry accounting, payroll, automated bank-feed/reconciliation, tax-filing or audited-accounts system. No claim of accounting-standard certification or zero latency is made.
- Print/CSV/report requests refuse date ranges over 366 days and data sets above 10,000 rows per source; narrow the period instead of silently truncating a report.

## Safeguards
Server-side tenant and role checks, server-assigned staff attribution, existing audit logs and payment validation are retained. A status-only expense/pledge edit now preserves bank/mobile-money details instead of normalizing it as cash; an intentional payment-method change still clears inapplicable details. Failed dashboard loads show an error/retry state rather than fabricated zero balances. Cash movement is explicitly not a bank balance.

## Validation
TypeScript and production build; PostgreSQL portal/finance integration tests, scoped totals (including dues and multiple currencies), duplicate-payment safety and payment-reference preservation; safe CSV unit tests; local synthetic desktop, mobile and dark-mode checks for navigation, modules, ledger search/export/print, dues, reports and load-failure/retry handling. The existing Excel-serial-date test remains a known unrelated failure. This archive is not a live deployment.

Release validation: production build and TypeScript passed. Full suite: 307 tests, 306 passed; the sole failure is the unchanged Excel serial-date expectation (1990-04-03 versus 1990-04-01).
