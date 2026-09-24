import axios from 'axios';
import crypto from 'crypto';

const ENV_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

/**
 * Paystack is considered configured if either a platform-level secret key
 * (env) or a church-level secret key (passed in) is available.
 */
export function isPaystackConfigured(secretKey?: string): boolean {
  return Boolean(secretKey || ENV_SECRET);
}

function resolveKey(secretKey?: string): string {
  const key = secretKey || ENV_SECRET;
  if (!key) {
    throw new Error(
      'Paystack is not configured. Set PAYSTACK_SECRET_KEY or add a church-level Paystack secret key.',
    );
  }
  return key;
}

function authHeaders(secretKey?: string) {
  return { Authorization: `Bearer ${resolveKey(secretKey)}` };
}

/**
 * Initialize a Paystack transaction. `amount` is in major units (e.g. GHS 50.00),
 * converted here to the subunit Paystack expects. Pass `secretKey` to use a
 * specific church's Paystack account instead of the platform default.
 */
export async function initializeTransaction(params: {
  email: string;
  amount: number;
  currency?: string;
  reference?: string;
  metadata?: Record<string, unknown>;
  callback_url?: string;
  secretKey?: string;
  /** Paystack subaccount that receives the church share. */
  subaccount?: string;
  /** Flat amount retained by the platform, in major currency units. */
  transactionCharge?: number;
  /** Which Paystack account absorbs Paystack's own processing fee. */
  bearer?: 'account' | 'subaccount';
}) {
  const response = await axios.post(
    `${PAYSTACK_BASE_URL}/transaction/initialize`,
    {
      email: params.email,
      amount: Math.round(Number(params.amount) * 100),
      currency: params.currency || 'GHS',
      reference: params.reference,
      metadata: params.metadata || {},
      callback_url: params.callback_url,
      ...(params.subaccount ? { subaccount: params.subaccount } : {}),
      ...(params.transactionCharge !== undefined ? { transaction_charge: Math.round(Number(params.transactionCharge) * 100) } : {}),
      ...(params.bearer ? { bearer: params.bearer } : {}),
    },
    { headers: authHeaders(params.secretKey) },
  );
  return response.data?.data;
}

/**
 * Verify a transaction by reference. Returns the Paystack transaction object
 * (status 'success' means the payment completed).
 */
export async function verifyTransaction(reference: string, secretKey?: string) {
  const response = await axios.get(
    `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: authHeaders(secretKey) },
  );
  return response.data?.data;
}

/**
 * Verify the signature Paystack sends on webhook calls (x-paystack-signature).
 * Requires the raw (unparsed) request body.
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string | undefined,
  secretKey?: string,
): boolean {
  const key = secretKey || ENV_SECRET;
  if (!key || !signature) return false;
  const hash = crypto.createHmac('sha512', key).update(rawBody).digest('hex');
  return hash === signature;
}


/** Confirms that Paystack verified the exact transaction we expected. */
export function verifiedPaymentMatches(
  data: any,
  expected: { reference: string; amount: number; currency?: string },
): boolean {
  if (!data || data.status !== 'success') return false;
  if (String(data.reference || '') !== String(expected.reference)) return false;
  const paidMajor = Number(data.amount) / 100;
  if (!Number.isFinite(paidMajor) || Math.abs(paidMajor - Number(expected.amount)) > 0.001) return false;
  if (expected.currency && data.currency && String(data.currency).toUpperCase() !== String(expected.currency).toUpperCase()) return false;
  return true;
}
