import crypto from 'crypto';

/**
 * Minimal, dependency-free TOTP (RFC 6238) implementation used for the
 * two-factor authentication feature. Compatible with Google Authenticator,
 * Authy, Microsoft Authenticator, etc. (SHA1, 6 digits, 30s period).
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateBase32Secret(length = 20): string {
  const bytes = crypto.randomBytes(length);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let secret = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    secret += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return secret;
}

function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bits = '';
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotp(secret: string, forTime: number = Date.now(), period = 30, digits = 6): string {
  const counter = Math.floor(forTime / 1000 / period);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const key = base32Decode(secret);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 10 ** digits).toString().padStart(digits, '0');
}

/** Verify a submitted code, allowing +/- 1 time-step of clock drift. */
export function verifyTotp(secret: string, token: string, period = 30, digits = 6): boolean {
  if (!secret || !token) return false;
  const normalized = String(token).replace(/\s/g, '');
  const now = Date.now();
  for (const drift of [-1, 0, 1]) {
    if (generateTotp(secret, now + drift * period * 1000, period, digits) === normalized) return true;
  }
  return false;
}

/** Build an otpauth:// URI for QR-code provisioning. */
export function buildOtpAuthUrl(secret: string, label: string, issuer = 'EpaChurch'): string {
  const encodedLabel = encodeURIComponent(label);
  const encodedIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${encodedIssuer}:${encodedLabel}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}
