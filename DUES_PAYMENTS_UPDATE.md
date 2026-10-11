# Staff dues payment recording

Deploy frontend AND server from this archive. Back up your database first. Startup adds nullable collectionPeriod, externalReference, recordedBy and notes columns to the existing dues payment table. Existing church/member/payment records remain intact. No church deletion is needed.

Church administrator: Finance → Member Dues → Record Dues Payment.
Finance officer/accountant: Finance dashboard → Member Dues → Record Dues Payment.
Use Set Member Dues first if a dues schedule does not exist. Both roles can manage schedules.

Choose a registered member, active dues schedule, amount received, collection period, actual payment date/time, method and transaction/receipt reference for non-cash entries. Currency is taken from the schedule. This records an already-received payment; it does not charge Paystack, send a payment notification, levy platform fees, or create a duplicate donation. Entries appear in the dues ledger and the member's existing dues payment history. Staff attribution is server-assigned and audit logged. Payment entries cannot be edited/deleted through this new form.

The same dialog submission carries an idempotency ID across network retries; one-time dues cannot be recorded twice for the same member. Recurring dues may have multiple entries (for instalments); verify the ledger before entering another payment. This update does not generate outstanding balances or revise general donation-only finance reports to include dues. Do not record the same dues as a donation as well.

Validation: TypeScript, production build and the PostgreSQL portal integration suite (including both finance/admin roles, member history, cross-church rejection, invalid inputs and duplicate submission protection).
