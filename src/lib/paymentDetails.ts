/**
 * Payment-method detail capture.
 *
 * Cash needs no paperwork, but every other method leaves a trail somewhere
 * else -- a mobile money wallet, a bank statement, a card terminal -- and the
 * finance team has to be able to match a record in Ecclesia to that trail.
 * These helpers define, validate and normalise the extra fields for each
 * method so giving, donations, pledges and expenses all behave identically.
 */

export type PaymentMethod = 'cash' | 'cheque' | 'card' | 'mobile_money' | 'bank' | string;

/** Every optional detail column that a money record may carry. */
export const PAYMENT_DETAIL_FIELDS = [
  'transactionId',
  'senderName',
  'senderNumber',
  'mobileMoneyNetwork',
  'bankName',
  'bankAccountName',
  'bankAccountNumber',
  'bankBranch',
  'transferReference',
  'cardLastFour',
  'cardHolderName',
  'authorizationCode',
  'paymentDate',
  'paymentNotes',
] as const;

export type PaymentDetailField = (typeof PAYMENT_DETAIL_FIELDS)[number];

/** Detail fields that make sense for each payment method. */
export const FIELDS_BY_METHOD: Record<string, PaymentDetailField[]> = {
  mobile_money: [
    'transactionId',
    'senderName',
    'senderNumber',
    'mobileMoneyNetwork',
    'paymentDate',
    'paymentNotes',
  ],
  bank: [
    'transactionId',
    'bankName',
    'bankAccountName',
    'bankAccountNumber',
    'bankBranch',
    'transferReference',
    'senderName',
    'paymentDate',
    'paymentNotes',
  ],
  card: [
    'transactionId',
    'cardHolderName',
    'cardLastFour',
    'authorizationCode',
    'paymentDate',
    'paymentNotes',
  ],
  cheque: ['transactionId', 'bankName', 'senderName', 'paymentDate', 'paymentNotes'],
  cash: ['paymentNotes'],
};

/**
 * The minimum a user must supply so the payment can actually be traced.
 * Deliberately short: over-requiring detail pushes people to type junk.
 */
export const REQUIRED_BY_METHOD: Record<string, PaymentDetailField[]> = {
  mobile_money: ['transactionId', 'senderName', 'senderNumber'],
  bank: ['bankName', 'transferReference'],
  card: ['transactionId'],
  cheque: ['transactionId'],
  cash: [],
};

export const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  cheque: 'Cheque',
  card: 'Card',
  mobile_money: 'Mobile Money',
  bank: 'Bank Transfer',
  paystack: 'Paystack (online)',
};

const FIELD_LABELS: Record<string, string> = {
  transactionId: 'Transaction ID',
  senderName: "Sender's name",
  senderNumber: "Sender's phone number",
  mobileMoneyNetwork: 'Mobile money network',
  bankName: 'Bank name',
  bankAccountName: 'Account name',
  bankAccountNumber: 'Account number',
  bankBranch: 'Bank branch',
  transferReference: 'Transfer reference',
  cardLastFour: 'Card last 4 digits',
  cardHolderName: 'Card holder name',
  authorizationCode: 'Authorization code',
  paymentDate: 'Payment date',
  paymentNotes: 'Notes',
};

/** True when the method requires supporting detail beyond the amount. */
export function needsPaymentDetails(method?: PaymentMethod): boolean {
  const m = String(method || 'cash').toLowerCase();
  return m === 'mobile_money' || m === 'bank' || m === 'card' || m === 'cheque';
}

const trim = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

/**
 * Keeps only the detail fields that belong to the chosen method, so switching
 * from "bank transfer" to "mobile money" cannot leave stale bank details
 * attached to the record.
 */
export function normalizePaymentDetails(
  method: PaymentMethod | undefined,
  body: Record<string, any>,
): Record<string, any> {
  const m = String(method || 'cash').toLowerCase();
  const allowed = FIELDS_BY_METHOD[m] || [];
  const out: Record<string, any> = {};
  for (const field of PAYMENT_DETAIL_FIELDS) {
    if (!allowed.includes(field)) {
      // Explicitly null rather than omitted, so an update clears details that
      // no longer apply to the newly-selected method.
      out[field] = null;
      continue;
    }
    const value = trim(body[field]);
    if (field === 'paymentDate') {
      const d = value ? new Date(value) : null;
      out[field] = d && !Number.isNaN(d.getTime()) ? d : null;
    } else {
      out[field] = value;
    }
  }
  return out;
}

/**
 * Validates the detail fields for a method.
 * Returns a user-facing message, or null when the input is acceptable.
 */
export function validatePaymentDetails(
  method: PaymentMethod | undefined,
  body: Record<string, any>,
): string | null {
  const m = String(method || 'cash').toLowerCase();
  const required = REQUIRED_BY_METHOD[m] || [];
  const missing = required.filter((f) => !trim(body[f]));
  if (missing.length > 0) {
    const names = missing.map((f) => FIELD_LABELS[f] || f);
    return `${METHOD_LABELS[m] || m} payments need ${names.join(', ')}.`;
  }
  if (m === 'mobile_money') {
    const number = trim(body.senderNumber) || '';
    // Accepts local and international formats; only rejects obvious typos.
    if (!/^\+?\d[\d\s-]{6,17}$/.test(number)) {
      return "Enter a valid sender's phone number, for example 0244123456.";
    }
  }
  if (m === 'card') {
    const last4 = trim(body.cardLastFour);
    if (last4 && !/^\d{4}$/.test(last4)) {
      return 'Card last 4 digits must be exactly four numbers.';
    }
  }
  return null;
}

/** Field metadata, used to build forms and API documentation responses. */
export function paymentDetailSchema(method: PaymentMethod) {
  const m = String(method || 'cash').toLowerCase();
  return (FIELDS_BY_METHOD[m] || []).map((field) => ({
    name: field,
    label: FIELD_LABELS[field] || field,
    required: (REQUIRED_BY_METHOD[m] || []).includes(field),
  }));
}
