import db from './db';
import { decryptSensitiveFields } from './crypto';

/**
 * Platform (super-admin) settings access.
 *
 * Rows live in `system_settings` as JSON blobs keyed by section ('email',
 * 'sms', 'payment', 'integration', 'backup', ...). Secrets inside those blobs
 * are encrypted at rest, so every read here goes through
 * `decryptSensitiveFields` -- callers get usable credentials, never ciphertext.
 *
 * Never send the result of `getPlatformSettings` straight to a browser: use
 * the masking form (`decryptSensitiveFields(value, true)`) for that, which is
 * what the super-admin settings endpoint already does.
 */
export async function getPlatformSettings(key: string): Promise<Record<string, any>> {
  try {
    const row = await db('system_settings').where({ key }).first();
    if (!row?.value) return {};
    const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    return decryptSensitiveFields(parsed) || {};
  } catch {
    // A missing table or malformed row must never take down a request path that
    // only wanted optional configuration.
    return {};
  }
}

/* ------------------------------------------------------------------ */
/* Sections the SUPER ADMIN owns on behalf of every church            */
/* ------------------------------------------------------------------ */

/**
 * Configuration sections a church admin may no longer edit themselves.
 *
 * These are provisioned centrally so that one vetted set of credentials (SMS
 * gateway, SMTP, payment gateway, third-party integrations and the backup
 * policy) applies to every tenant. Churches keep read access so they can see
 * what is configured for them, but writes are rejected -- see
 * `PUT /church/settings/:key`.
 */
export const SUPERADMIN_MANAGED_CHURCH_SETTINGS = [
  'sms',
  'email',
  'payment',
  'paystack',
  'integration',
  'backup',
] as const;

export function isSuperadminManagedSetting(key: string): boolean {
  return (SUPERADMIN_MANAGED_CHURCH_SETTINGS as readonly string[]).includes(key);
}

/* ------------------------------------------------------------------ */
/* Payment gateway credentials                                        */
/* ------------------------------------------------------------------ */

export type PlatformGateway = {
  provider: string;
  secretKey: string;
  publicKey?: string;
  currency: string;
  enabled: boolean;
};

/**
 * The platform's own payment gateway credentials.
 *
 * Church-facing platform charges (currently SMS bundles) must be collected
 * into the PLATFORM's account using the super admin's API key -- not the
 * church's own Paystack account, which exists for member giving. Falls back to
 * the PAYSTACK_SECRET_KEY environment variable so a deployment that configures
 * the gateway only through env still works.
 */
export async function getPlatformGateway(): Promise<PlatformGateway> {
  const payment = await getPlatformSettings('payment');
  return {
    provider: String(payment.provider || 'Paystack'),
    secretKey: String(payment.secretKey || process.env.PAYSTACK_SECRET_KEY || ''),
    publicKey: payment.publicKey ? String(payment.publicKey) : undefined,
    currency: String(payment.currency || 'GHS'),
    // `enabled` defaults to true: an installation that filled in a secret key
    // but never toggled the switch should still be able to take payments.
    enabled: payment.enabled === undefined ? true : Boolean(payment.enabled),
  };
}

/** Platform SMS gateway credentials (used for platform-originated messages). */
export async function getPlatformSmsConfig(): Promise<{
  apiKey?: string;
  senderId?: string;
  enabled: boolean;
  provider?: string;
}> {
  const sms = await getPlatformSettings('sms');
  return {
    apiKey: sms.apiKey ? String(sms.apiKey) : process.env.MNOTIFY_API_KEY,
    senderId: sms.senderId ? String(sms.senderId) : process.env.MNOTIFY_SENDER_ID,
    enabled: sms.enabled === undefined ? true : Boolean(sms.enabled),
    provider: sms.provider ? String(sms.provider) : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Transaction charges                                                */
/* ------------------------------------------------------------------ */

export type TransactionCharge = {
  /** Percentage of the transaction value, e.g. 1.95 for 1.95%. */
  percent: number;
  /** Flat fee added on top of the percentage, in the transaction currency. */
  flat: number;
  /** Upper limit for the charge. 0 (or less) means "no cap". */
  cap: number;
  /**
   * Who absorbs the charge:
   *  - 'payer'    : added on top, so the church/member is billed amount + charge
   *  - 'recipient': deducted from the amount, so the church receives less
   */
  bearer: 'payer' | 'recipient';
  enabled: boolean;
};

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/**
 * Reads the platform-wide transaction charge configured by the super admin.
 * Stored alongside the payment gateway settings so there is a single place
 * where "how we charge" lives.
 */
export async function getTransactionCharge(): Promise<TransactionCharge> {
  const payment = await getPlatformSettings('payment');
  const percent = num(payment.transactionChargePercent);
  const flat = num(payment.transactionChargeFlat);
  const cap = num(payment.transactionChargeCap);
  const bearer = payment.transactionChargeBearer === 'recipient' ? 'recipient' : 'payer';
  // A charge is only "on" when it is both enabled and actually non-zero, so an
  // unconfigured platform never silently alters amounts.
  const enabledFlag =
    payment.transactionChargeEnabled === undefined
      ? true
      : Boolean(payment.transactionChargeEnabled);
  return {
    percent,
    flat,
    cap,
    bearer,
    enabled: enabledFlag && (percent > 0 || flat > 0),
  };
}

export type ChargeBreakdown = {
  /** The original transaction value requested. */
  baseAmount: number;
  /** The platform charge applied to it. */
  chargeAmount: number;
  /** What the payer is actually billed. */
  totalAmount: number;
  /** What the church nets after the charge. */
  netAmount: number;
  chargeBearer: 'payer' | 'recipient';
};

/** Rounds to 2 decimal places without floating-point drift (e.g. 10.005). */
const money = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Applies a transaction charge to an amount.
 *
 * Pure and synchronous so it can be unit tested and reused by any payment path
 * (SMS bundles, giving, donations). Pass the config from
 * `getTransactionCharge()`.
 */
export function applyTransactionCharge(
  amount: number,
  charge: TransactionCharge,
): ChargeBreakdown {
  const base = money(Math.max(0, num(amount)));
  if (!charge.enabled || base <= 0) {
    return {
      baseAmount: base,
      chargeAmount: 0,
      totalAmount: base,
      netAmount: base,
      chargeBearer: charge.bearer,
    };
  }
  let fee = money(base * (charge.percent / 100) + charge.flat);
  if (charge.cap > 0) fee = Math.min(fee, money(charge.cap));
  // The charge can never exceed the transaction itself when deducted, or the
  // church would end up with a negative settlement.
  if (charge.bearer === 'recipient') fee = Math.min(fee, base);
  return {
    baseAmount: base,
    chargeAmount: fee,
    totalAmount: charge.bearer === 'payer' ? money(base + fee) : base,
    netAmount: charge.bearer === 'payer' ? base : money(base - fee),
    chargeBearer: charge.bearer,
  };
}

/** Convenience wrapper: read the configured charge and apply it in one step. */
export async function chargeFor(amount: number): Promise<ChargeBreakdown> {
  return applyTransactionCharge(amount, await getTransactionCharge());
}
