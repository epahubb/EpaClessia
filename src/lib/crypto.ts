/**
 * Secrets-at-rest encryption (AES-256-GCM).
 *
 * Sensitive configuration values (payment gateway secret keys, SMS/email
 * credentials, webhook secrets, etc.) must never be stored in the database in
 * plain text. This module provides authenticated encryption so that a database
 * dump alone cannot leak provider credentials.
 *
 * Key resolution order:
 *   1. SECRETS_ENCRYPTION_KEY  (recommended: 32-byte key, hex or base64)
 *   2. Derived from JWT_SECRET  (fallback so the app keeps working if the
 *      dedicated key is not set; a warning is emitted in production).
 *
 * Encrypted values are self-describing strings:
 *   enc:v1:<ivHex>:<authTagHex>:<cipherTextHex>
 * so decryptSecret() can transparently pass through values that were never
 * encrypted (e.g. legacy plain-text rows) without throwing.
 */
import crypto from 'crypto';
import { JWT_SECRET, IS_PROD } from './config';

const PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';

function resolveKey(): Buffer {
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (raw && raw.trim()) {
    // Accept hex, base64, or raw passphrase; always normalise to 32 bytes.
    const trimmed = raw.trim();
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, 'hex');
    try {
      const b64 = Buffer.from(trimmed, 'base64');
      if (b64.length === 32) return b64;
    } catch {
      /* fall through to hashing */
    }
    return crypto.createHash('sha256').update(trimmed).digest();
  }

  if (IS_PROD) {
    console.warn(
      '[crypto] SECRETS_ENCRYPTION_KEY is not set. Falling back to a key derived ' +
        'from JWT_SECRET. Set a dedicated SECRETS_ENCRYPTION_KEY in production.',
    );
  }
  // Deterministic 32-byte key derived from the app JWT secret.
  return crypto.createHash('sha256').update(`secrets:${JWT_SECRET}`).digest();
}

const KEY = resolveKey();

export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/** Encrypt a single string value. Returns a self-describing token. */
export function encryptSecret(plainText: string): string {
  if (plainText === undefined || plainText === null || plainText === '') return '';
  if (isEncrypted(plainText)) return plainText; // already encrypted
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

/** Decrypt a value. Non-encrypted / legacy values are returned unchanged. */
export function decryptSecret(value: string): string {
  if (!isEncrypted(value)) return value ?? '';
  try {
    const [, , ivHex, tagHex, dataHex] = value.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
    return dec.toString('utf8');
  } catch (err) {
    console.error('[crypto] Failed to decrypt secret value:', (err as Error).message);
    return '';
  }
}

/**
 * The property names that hold sensitive credentials inside settings blobs.
 * These are encrypted before persistence and decrypted (or masked) on read.
 */
export const SENSITIVE_SETTING_KEYS = [
  'secretKey',
  'clientSecret',
  'apiKey',
  'password',
  'privateKey',
  'token',
  'webhookSecret',
  'smtpPassword',
  'paystackSecretKey',
];

const isSensitiveKey = (key: string) =>
  SENSITIVE_SETTING_KEYS.some((k) => key.toLowerCase() === k.toLowerCase());

/** Recursively encrypt sensitive keys within an arbitrary settings object. */
export function encryptSensitiveFields<T = any>(obj: T): T {
  if (Array.isArray(obj)) return obj.map((v) => encryptSensitiveFields(v)) as any;
  if (obj && typeof obj === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === 'string' && isSensitiveKey(k) && v !== '') {
        out[k] = encryptSecret(v);
      } else if (v && typeof v === 'object') {
        out[k] = encryptSensitiveFields(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return obj;
}

/**
 * Recursively decrypt sensitive keys. When `mask` is true, secrets are replaced
 * with a fixed mask so they are never returned to the browser in clear text.
 */
export function decryptSensitiveFields<T = any>(obj: T, mask = false): T {
  if (Array.isArray(obj)) return obj.map((v) => decryptSensitiveFields(v, mask)) as any;
  if (obj && typeof obj === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === 'string' && isSensitiveKey(k) && v !== '') {
        out[k] = mask ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : decryptSecret(v);
      } else if (v && typeof v === 'object') {
        out[k] = decryptSensitiveFields(v, mask);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return obj;
}
