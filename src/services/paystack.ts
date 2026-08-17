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
