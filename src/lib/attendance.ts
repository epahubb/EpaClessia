import { randomBytes, createHash, timingSafeEqual } from 'crypto';

/**
 * Attendance logic shared by the QR, manual and biometric paths.
 *
 * Everything here is pure (or depends only on node crypto) so it can be tested
 * without a database or an HTTP request. The routes stay thin wrappers around
 * these functions.
 */

export type AttendanceMethod = 'manual' | 'qr' | 'biometric';
export const ATTENDANCE_METHODS: AttendanceMethod[] = ['manual', 'qr', 'biometric'];

/**
 * How long an event QR code stays valid. A static code would be screenshotted
 * and shared in a WhatsApp group by people who never came, so it rotates.
 */
export const QR_TOKEN_TTL_MINUTES = 10;

/** A punch is accepted this long before an event starts. */
export const PUNCH_EARLY_WINDOW_MINUTES = 60;
/** ...and this long after it ends, for latecomers and slow device syncing. */
export const PUNCH_LATE_WINDOW_MINUTES = 60;
/** Assumed event length when an event has no explicit end time. */
export const DEFAULT_EVENT_DURATION_MINUTES = 120;
/**
 * Repeat punches from the same finger inside this window are duplicates.
 * ZKTeco devices commonly send the same punch several times, and members touch
 * the sensor twice when unsure it registered.
 */
export const PUNCH_DEDUPE_WINDOW_MINUTES = 10;

const MS_PER_MINUTE = 60_000;

/* ------------------------------------------------------------------ */
/* QR tokens                                                           */
/* ------------------------------------------------------------------ */

export type QrTokenIssue = { token: string; expiresAt: Date };

/**
 * Issue a fresh QR token for an event.
 *
 * base64url keeps the token safe inside a QR payload and a URL without escaping.
 */
export function generateQrToken(now: Date = new Date()): QrTokenIssue {
  return {
    token: randomBytes(24).toString('base64url'),
    expiresAt: new Date(now.getTime() + QR_TOKEN_TTL_MINUTES * MS_PER_MINUTE),
  };
}

const QR_PREFIX = 'ecclesia:attend';

/** Build the exact string encoded into the displayed QR image. */
export function buildQrPayload(eventId: string, token: string): string {
  return `${QR_PREFIX}:${eventId}:${token}`;
}

/**
 * Parse a scanned QR payload.
 *
 * Returns null for anything that is not one of our attendance codes, so a
 * member scanning a random product barcode gets a clear message instead of a
 * confusing server error. The token may contain no colons, so the split is
 * bounded to keep an unexpected extra segment from being read as a token.
 */
export function parseQrPayload(raw: string): { eventId: string; token: string } | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text.startsWith(`${QR_PREFIX}:`)) return null;

  const parts = text.split(':');
  // ['ecclesia', 'attend', eventId, token]
  if (parts.length !== 4) return null;

  const eventId = parts[2];
  const token = parts[3];
  if (!eventId || !token) return null;
  return { eventId, token };
}

/** Constant-time string comparison that tolerates differing lengths. */
export function safeEquals(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, so compare digests instead:
  // equal-length digests keep the comparison constant-time.
  const hashA = createHash('sha256').update(bufA).digest();
  const hashB = createHash('sha256').update(bufB).digest();
  return timingSafeEqual(hashA, hashB);
}

// `reason` is declared (as undefined) on the success branch too. This project
// compiles with strictNullChecks off, which stops TypeScript from narrowing a
// union on a boolean discriminant, so callers inside `if (!check.ok)` could not
// otherwise read `check.reason` without a cast.
/**
 * Whether an event's QR code should be accepted right now.
 *
 * A rotating token answers "is this code current"; this answers the separate
 * question "is this event happening". Both must hold: a valid token scanned
 * three days early is still not attendance at that service.
 *
 * `reason` distinguishes too-early from too-late so the caller can say which,
 * rather than a flat "invalid" that leaves a member guessing.
 */
export type QrWindowResult =
  | { ok: true; reason?: undefined; startsAt: Date; endsAt: Date }
  | {
      ok: false;
      reason: 'not_started' | 'ended' | 'no_schedule';
      startsAt?: Date;
      endsAt?: Date;
    };

/**
 * Resolve an event's attendance window.
 *
 * An event with no end time is treated as lasting DEFAULT_EVENT_DURATION_MINUTES
 * rather than for ever: a code that never stops working is the problem being
 * fixed here, and the same fallback already governs biometric punch matching.
 */
export function eventAttendanceWindow(
  event: { startTime?: string | Date | null; endTime?: string | Date | null },
): { startsAt: Date; endsAt: Date } | null {
  const start = event?.startTime ? new Date(event.startTime) : null;
  if (!start || Number.isNaN(start.getTime())) return null;

  const rawEnd = event?.endTime ? new Date(event.endTime) : null;
  const endsAt =
    rawEnd && !Number.isNaN(rawEnd.getTime()) && rawEnd.getTime() > start.getTime()
      ? rawEnd
      : new Date(start.getTime() + DEFAULT_EVENT_DURATION_MINUTES * MS_PER_MINUTE);

  return { startsAt: start, endsAt };
}

/**
 * Check the scanning window for an event.
 *
 * @param event Row holding `startTime` and (optionally) `endTime`.
 */
export function checkEventQrWindow(
  event: { startTime?: string | Date | null; endTime?: string | Date | null },
  now: Date = new Date(),
): QrWindowResult {
  const window = eventAttendanceWindow(event);
  // An event with no usable start time has no window to be inside of. Failing
  // closed keeps an unscheduled draft from quietly accepting attendance.
  if (!window) return { ok: false, reason: 'no_schedule' };

  const { startsAt, endsAt } = window;
  const at = now.getTime();
  if (at < startsAt.getTime()) return { ok: false, reason: 'not_started', startsAt, endsAt };
  if (at > endsAt.getTime()) return { ok: false, reason: 'ended', startsAt, endsAt };
  return { ok: true, startsAt, endsAt };
}

export type QrCheckResult =
  | { ok: true; reason?: undefined }
  | { ok: false; reason: 'no_token' | 'expired' | 'mismatch' };

/**
 * Validate a scanned token against the event row.
 *
 * @param event Row holding `qrToken` and `qrTokenExpiresAt`.
 */
export function checkQrToken(
  event: { qrToken?: string | null; qrTokenExpiresAt?: string | Date | null },
  token: string,
  now: Date = new Date(),
): QrCheckResult {
  if (!event?.qrToken) return { ok: false, reason: 'no_token' };
  if (!safeEquals(event.qrToken, token)) return { ok: false, reason: 'mismatch' };

  // A missing expiry is treated as expired rather than eternal: failing closed
  // is the safer default for a credential.
  if (!event.qrTokenExpiresAt) return { ok: false, reason: 'expired' };
  const expiresAt = new Date(event.qrTokenExpiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Biometric device keys                                               */
/* ------------------------------------------------------------------ */

/**
 * Hash a device API key.
 *
 * sha256 rather than bcrypt is deliberate: these keys are 32 random bytes we
 * generate ourselves, so they are not guessable by dictionary attack, and the
 * ingest endpoint verifies one on every punch. bcrypt would add latency to a
 * hot path for no security gain against a high-entropy secret.
 */
export function hashDeviceApiKey(apiKey: string): string {
  return createHash('sha256').update(String(apiKey)).digest('hex');
}

export function generateDeviceApiKey(): { apiKey: string; apiKeyHash: string } {
  const apiKey = randomBytes(32).toString('base64url');
  return { apiKey, apiKeyHash: hashDeviceApiKey(apiKey) };
}

export function verifyDeviceApiKey(apiKey: string, storedHash: string): boolean {
  if (!apiKey || !storedHash) return false;
  return safeEquals(hashDeviceApiKey(apiKey), storedHash);
}

/* ------------------------------------------------------------------ */
/* Values coming back from the database                                */
/* ------------------------------------------------------------------ */

/**
 * Coerce a stored "present" value to a boolean.
 *
 * SQLite has no boolean type and returns 1/0, while Postgres returns true/false
 * and form posts arrive as strings. Without this, `if (row.present)` is true for
 * the string '0' and every absent member would count as present.
 */
export function normalizePresent(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['0', 'false', 'no', 'absent', ''].includes(v)) return false;
    return ['1', 'true', 'yes', 'present'].includes(v);
  }
  return false;
}

export function normalizeMethod(value: unknown): AttendanceMethod {
  const v = String(value ?? '').trim().toLowerCase();
  return (ATTENDANCE_METHODS as string[]).includes(v) ? (v as AttendanceMethod) : 'manual';
}

/* ------------------------------------------------------------------ */
/* Matching a device punch to an event                                 */
/* ------------------------------------------------------------------ */

export type EventWindow = {
  id: string;
  startTime: string | Date;
  endTime?: string | Date | null;
};

/**
 * Pick which event a biometric punch belongs to.
 *
 * A ZKTeco device knows nothing about events: it reports "finger 12 at 09:04".
 * The punch is matched to any event whose window contains it, preferring the
 * event that starts closest to the punch so that back-to-back services do not
 * steal each other's attendance. Returns null when nothing is in range, which
 * the caller records as an unmatched punch rather than discarding.
 */
export function resolvePunchEvent(
  punchedAt: Date,
  events: EventWindow[],
  opts: { earlyMinutes?: number; lateMinutes?: number } = {},
): string | null {
  const early = opts.earlyMinutes ?? PUNCH_EARLY_WINDOW_MINUTES;
  const late = opts.lateMinutes ?? PUNCH_LATE_WINDOW_MINUTES;
  const punch = punchedAt.getTime();
  if (Number.isNaN(punch)) return null;

  let best: { id: string; distance: number } | null = null;

  for (const event of events || []) {
    const start = new Date(event.startTime).getTime();
    if (Number.isNaN(start)) continue;

    const rawEnd = event.endTime ? new Date(event.endTime).getTime() : NaN;
    const end = Number.isNaN(rawEnd)
      ? start + DEFAULT_EVENT_DURATION_MINUTES * MS_PER_MINUTE
      : rawEnd;

    const windowStart = start - early * MS_PER_MINUTE;
    const windowEnd = end + late * MS_PER_MINUTE;
    if (punch < windowStart || punch > windowEnd) continue;

    const distance = Math.abs(punch - start);
    if (!best || distance < best.distance) best = { id: event.id, distance };
  }

  return best ? best.id : null;
}

/**
 * Whether a punch repeats one already recorded for the same finger.
 */
export function isDuplicatePunch(
  previousPunchAt: Date | string | null | undefined,
  punchedAt: Date,
  windowMinutes: number = PUNCH_DEDUPE_WINDOW_MINUTES,
): boolean {
  if (!previousPunchAt) return false;
  const prev = new Date(previousPunchAt).getTime();
  if (Number.isNaN(prev)) return false;
  const diff = Math.abs(punchedAt.getTime() - prev);
  return diff <= windowMinutes * MS_PER_MINUTE;
}

/* ------------------------------------------------------------------ */
/* Roll call + summary                                                 */
/* ------------------------------------------------------------------ */

export type RollCallMember = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  membershipId?: string | null;
  hasPhoto?: boolean;
};

export type AttendanceRow = {
  id?: number | string;
  memberId?: string | null;
  present?: unknown;
  method?: unknown;
  status?: string | null;
  checkInAt?: string | Date | null;
};

export type RollCallEntry = {
  memberId: string;
  firstName: string | null;
  lastName: string | null;
  membershipId: string | null;
  hasPhoto: boolean;
  /** null means nobody has marked this member yet. */
  present: boolean | null;
  method: AttendanceMethod | null;
  attendanceId: number | string | null;
  checkInAt: string | Date | null;
};

/**
 * Merge the member register with recorded attendance for one event.
 *
 * The roll call must list every member, not only those already marked --
 * otherwise a secretary cannot see who is missing, which is the whole point.
 * `present: null` distinguishes "not yet marked" from "marked absent".
 */
export function buildRollCall(
  members: RollCallMember[],
  rows: AttendanceRow[],
): RollCallEntry[] {
  const byMember = new Map<string, AttendanceRow>();
  for (const row of rows || []) {
    if (!row?.memberId) continue;
    const existing = byMember.get(row.memberId);
    // Keep the most recent record when a member somehow has several.
    if (!existing) {
      byMember.set(row.memberId, row);
      continue;
    }
    const a = existing.checkInAt ? new Date(existing.checkInAt).getTime() : 0;
    const b = row.checkInAt ? new Date(row.checkInAt).getTime() : 0;
    if (b >= a) byMember.set(row.memberId, row);
  }

  return (members || []).map((m) => {
    const row = byMember.get(m.id);
    return {
      memberId: m.id,
      firstName: m.firstName ?? null,
      lastName: m.lastName ?? null,
      membershipId: m.membershipId ?? null,
      hasPhoto: !!m.hasPhoto,
      present: row ? normalizePresent(row.present) : null,
      method: row ? normalizeMethod(row.method) : null,
      attendanceId: row?.id ?? null,
      checkInAt: row?.checkInAt ?? null,
    };
  });
}

export type AttendanceSummary = {
  totalMembers: number;
  present: number;
  absent: number;
  unmarked: number;
  byMethod: Record<AttendanceMethod, number>;
};

export function summarizeRollCall(entries: RollCallEntry[]): AttendanceSummary {
  const summary: AttendanceSummary = {
    totalMembers: entries?.length || 0,
    present: 0,
    absent: 0,
    unmarked: 0,
    byMethod: { manual: 0, qr: 0, biometric: 0 },
  };

  for (const e of entries || []) {
    if (e.present === null) {
      summary.unmarked += 1;
      continue;
    }
    if (e.present) {
      summary.present += 1;
      if (e.method) summary.byMethod[e.method] += 1;
    } else {
      summary.absent += 1;
    }
  }

  return summary;
}
