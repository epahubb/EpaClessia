/**
 * Member engagement classification.
 *
 * Churches want to know, from attendance alone, who is committed (active), who
 * is drifting (inactive) and who has effectively stopped coming (backslider).
 * The rules live here as pure functions so they are unit-testable and identical
 * everywhere they are applied -- the nightly/manual recalculation, the member
 * list and the absence follow-up all share this one definition.
 */

export type EngagementStatus = 'active' | 'inactive' | 'backslider' | 'new';

export type EngagementThresholds = {
  /** Attended at least this many services in the window => active. */
  activeMinAttendances: number;
  /** Length of the review window, in days. */
  windowDays: number;
  /** No attendance for this many days => inactive. */
  inactiveAfterDays: number;
  /** No attendance for this many days => backslider. */
  backsliderAfterDays: number;
  /** Members who joined within this many days are treated as 'new'. */
  graceDays: number;
};

export const DEFAULT_THRESHOLDS: EngagementThresholds = {
  activeMinAttendances: 2,
  windowDays: 56, // eight weeks
  inactiveAfterDays: 28, // a month away
  backsliderAfterDays: 84, // three months away
  graceDays: 30,
};

const posInt = (v: unknown, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Merges church-configured overrides onto the defaults, ignoring anything
 * non-numeric, and keeps the thresholds internally consistent (a backslider
 * window shorter than the inactive one would make 'inactive' unreachable).
 */
export function resolveThresholds(overrides?: Partial<Record<keyof EngagementThresholds, unknown>>): EngagementThresholds {
  const t: EngagementThresholds = {
    activeMinAttendances: posInt(overrides?.activeMinAttendances, DEFAULT_THRESHOLDS.activeMinAttendances),
    windowDays: posInt(overrides?.windowDays, DEFAULT_THRESHOLDS.windowDays),
    inactiveAfterDays: posInt(overrides?.inactiveAfterDays, DEFAULT_THRESHOLDS.inactiveAfterDays),
    backsliderAfterDays: posInt(overrides?.backsliderAfterDays, DEFAULT_THRESHOLDS.backsliderAfterDays),
    graceDays: posInt(overrides?.graceDays, DEFAULT_THRESHOLDS.graceDays),
  };
  if (t.backsliderAfterDays <= t.inactiveAfterDays) {
    t.backsliderAfterDays = t.inactiveAfterDays * 2;
  }
  return t;
}

export const daysBetween = (from: Date | string, to: Date | string): number => {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.floor((b - a) / 86_400_000);
};

export type EngagementInput = {
  /** Most recent attendance date, or null when the member has never attended. */
  lastAttendedAt?: Date | string | null;
  /** Attendances counted inside the review window. */
  attendancesInWindow?: number;
  /** When the member joined the church, used for the new-member grace period. */
  joinDate?: Date | string | null;
};

export type EngagementResult = {
  status: EngagementStatus;
  daysSinceLastAttendance: number | null;
  attendancesInWindow: number;
  /** Plain-language explanation shown to church admins. */
  reason: string;
};

/**
 * Classifies one member.
 *
 * Order matters: the longest absence wins, so a member who has been away past
 * the backslider threshold is never reported as merely inactive even if they
 * attended several times earlier in the window.
 */
export function classifyMember(
  input: EngagementInput,
  thresholds: EngagementThresholds = DEFAULT_THRESHOLDS,
  now: Date = new Date(),
): EngagementResult {
  const attendances = Math.max(0, Math.floor(Number(input.attendancesInWindow || 0)));
  const since = input.lastAttendedAt ? daysBetween(input.lastAttendedAt, now) : null;
  const membershipAge = input.joinDate ? daysBetween(input.joinDate, now) : null;

  // Someone who joined days ago has not had the chance to build a record yet;
  // labelling them a backslider would be both wrong and discouraging.
  if (since === null && membershipAge !== null && membershipAge <= thresholds.graceDays) {
    return {
      status: 'new',
      daysSinceLastAttendance: null,
      attendancesInWindow: attendances,
      reason: `Recently joined (${membershipAge} day(s) ago) and has no attendance recorded yet.`,
    };
  }

  if (since === null) {
    return {
      status: 'backslider',
      daysSinceLastAttendance: null,
      attendancesInWindow: attendances,
      reason: 'No attendance has ever been recorded for this member.',
    };
  }

  if (since >= thresholds.backsliderAfterDays) {
    return {
      status: 'backslider',
      daysSinceLastAttendance: since,
      attendancesInWindow: attendances,
      reason: `Last attended ${since} days ago, beyond the ${thresholds.backsliderAfterDays}-day backslider threshold.`,
    };
  }

  if (since >= thresholds.inactiveAfterDays) {
    return {
      status: 'inactive',
      daysSinceLastAttendance: since,
      attendancesInWindow: attendances,
      reason: `Last attended ${since} days ago, beyond the ${thresholds.inactiveAfterDays}-day inactivity threshold.`,
    };
  }

  if (attendances >= thresholds.activeMinAttendances) {
    return {
      status: 'active',
      daysSinceLastAttendance: since,
      attendancesInWindow: attendances,
      reason: `Attended ${attendances} time(s) in the last ${thresholds.windowDays} days.`,
    };
  }

  // Seen recently, but not often enough to call them active.
  return {
    status: 'inactive',
    daysSinceLastAttendance: since,
    attendancesInWindow: attendances,
    reason: `Only ${attendances} attendance(s) in the last ${thresholds.windowDays} days, fewer than the ${thresholds.activeMinAttendances} required to be active.`,
  };
}

/**
 * Decides whether an absence is worth following up with a questionnaire.
 * Members who have never been reachable, or who are already known to have
 * responded, are handled by the caller.
 */
export function shouldFollowUp(result: EngagementResult): boolean {
  return result.status === 'inactive' || result.status === 'backslider';
}
