/**
 * Statistical returns for a ministry, group or department.
 *
 * Every figure on this return is counted from records the church already keeps.
 * Nothing on the sheet is a number somebody typed into it.
 *
 * That is the whole design principle here, and it is worth being explicit about
 * why. A return whose figures are typed in can drift away from the register it
 * claims to describe: the sheet says nine baptisms, the member records show
 * seven, and nobody can say which is right. When every figure is counted from
 * the underlying records instead, the two can never disagree, and any figure can
 * be opened to reveal exactly which people, services, visits or payments
 * produced it.
 *
 * The cost of that principle is that each figure needs a real home in the
 * system -- a place where the fact is recorded as part of doing the work, not as
 * part of filing a return. Those homes are:
 *
 *   - the member record, for conversion, baptisms and transfers in;
 *   - the member's status history, written automatically whenever a member's
 *     standing changes, for transfers out, deaths, backsliding and restoration;
 *   - attendance at communion services, for the Lord's Supper figure;
 *   - the visitation log, for visits by the presiding elder and by ministers;
 *   - the expense record, for interventional support;
 *   - the unit roster and its logged meetings, for membership and meetings.
 *
 * This module owns the catalogue that describes that mapping, and the
 * arithmetic of the comparison. The query for each figure lives in the church
 * routes, next to the database.
 */

/** The kinds of unit a return can be filed for. */
export const UNIT_TYPES = ['ministry', 'department', 'group'] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  ministry: 'Ministry',
  department: 'Department',
  group: 'Group',
};

/**
 * Which body of records a figure is counted from.
 *
 * Shown on the sheet so that a leader who disagrees with a figure knows exactly
 * where to go and correct it.
 */
export type MetricSource =
  | 'roster'      // the unit's membership roster
  | 'members'     // dated milestones on the member record
  | 'history'     // the member status history, written automatically
  | 'attendance'  // logged attendance at services and meetings
  | 'visits'      // the visitation log
  | 'finance';    // recorded expenditure

export const SOURCE_LABELS: Record<MetricSource, string> = {
  roster: 'Unit roster',
  members: 'Member records',
  history: 'Status history',
  attendance: 'Attendance records',
  visits: 'Visitation log',
  finance: 'Finance records',
};

/** How a figure should be read and formatted. */
export type MetricKind = 'count' | 'currency' | 'people';

/**
 * Which direction is good news.
 *
 * Variance is shown in colour, and colouring a rise in deaths green would be
 * grotesque. Figures where neither direction is inherently good are marked
 * neutral and shown plainly.
 */
export type MetricPolarity = 'up_good' | 'down_good' | 'neutral';

export type MetricDefinition = {
  key: string;
  label: string;
  source: MetricSource;
  kind: MetricKind;
  polarity: MetricPolarity;
  /** What the figure counts. */
  description: string;
  /**
   * Where the underlying fact is recorded, in the words of the screen the user
   * would go to. This is what makes the return actionable: a figure that looks
   * wrong comes with the address of the record behind it.
   */
  recordedAt: string;
  /**
   * A standing figure -- how many there are as at the end of the period --
   * rather than a count of things that happened during it. Membership is
   * standing; a baptism is not.
   */
  standing?: boolean;
};

/**
 * The statistical return, in the order it is filed.
 *
 * The order is part of the form: officers read these sheets top-to-bottom and
 * compare them across units, so it is fixed here rather than left to whatever
 * order a database happens to return rows in.
 */
export const STAT_METRICS: MetricDefinition[] = [
  {
    key: 'totalMembership',
    label: 'Total membership',
    source: 'roster',
    kind: 'people',
    polarity: 'up_good',
    standing: true,
    description: 'Everyone on the roll of this unit at the end of the period.',
    recordedAt: 'Members \u2014 the group or ministries on each member record',
  },
  {
    key: 'officers',
    label: 'Officers',
    source: 'roster',
    kind: 'people',
    polarity: 'neutral',
    standing: true,
    description:
      'Members holding a leadership role in this unit \u2014 leader, coordinator, assistant.',
    recordedAt: 'Ministries & Groups \u2014 the role on each roster entry',
  },
  {
    key: 'otherOfficeHolders',
    label: 'Other office holders',
    source: 'members',
    kind: 'people',
    polarity: 'neutral',
    standing: true,
    description:
      'Members of this unit who hold a church office \u2014 elder, deacon, usher \u2014 without being an officer of the unit itself.',
    recordedAt: 'Members \u2014 the Office field on each member record',
  },
  {
    key: 'newConverts',
    label: 'New converts',
    source: 'members',
    kind: 'people',
    polarity: 'up_good',
    description: 'Members of this unit who gave their lives to Christ during the period.',
    recordedAt: 'Members \u2014 Date of conversion',
  },
  {
    key: 'waterBaptism',
    label: 'Water baptism',
    source: 'members',
    kind: 'people',
    polarity: 'up_good',
    description: 'Members of this unit baptised in water during the period.',
    recordedAt: 'Members \u2014 Water baptism date',
  },
  {
    key: 'holySpiritBaptism',
    label: 'Holy Spirit baptism',
    source: 'members',
    kind: 'people',
    polarity: 'up_good',
    description: 'Members of this unit baptised in the Holy Spirit during the period.',
    recordedAt: 'Members \u2014 Holy Spirit baptism date',
  },
  {
    key: 'transfersIn',
    label: 'Transfers in',
    source: 'members',
    kind: 'people',
    polarity: 'up_good',
    description: 'Members received into this unit from another church, branch or unit.',
    recordedAt: 'Members \u2014 Transferred in on, and Transferred from',
  },
  {
    key: 'transfersOut',
    label: 'Transfers out',
    source: 'history',
    kind: 'people',
    polarity: 'down_good',
    description: 'Members who left this unit for another church, branch or unit.',
    recordedAt: 'Members \u2014 recorded when a member\u2019s status is set to Transferred',
  },
  {
    key: 'backsliders',
    label: 'Backsliders',
    source: 'history',
    kind: 'people',
    polarity: 'down_good',
    description: 'Members who fell away during the period.',
    recordedAt: 'Engagement & Follow-up \u2014 recorded when attendance tracking classifies a member as a backslider',
  },
  {
    key: 'deaths',
    label: 'Deaths',
    source: 'history',
    kind: 'people',
    polarity: 'neutral',
    description: 'Members who died during the period.',
    recordedAt: 'Members \u2014 recorded when a member\u2019s status is set to Deceased',
  },
  {
    key: 'meetingsHeld',
    label: 'Number of meetings held',
    source: 'attendance',
    kind: 'count',
    polarity: 'up_good',
    description: 'Meetings and services of this unit with attendance logged during the period.',
    recordedAt: 'Attendance \u2014 each logged session for this unit',
  },
  {
    key: 'soulsWon',
    label: 'Number of souls won',
    source: 'members',
    kind: 'people',
    polarity: 'up_good',
    description:
      'Souls won through the members of this unit \u2014 counted from the member who is credited with winning each convert.',
    recordedAt: 'Members \u2014 Won to Christ by, on the convert\u2019s record',
  },
  {
    key: 'lordsSupperAttendance',
    label: 'Lord\u2019s Supper attendance',
    source: 'attendance',
    kind: 'people',
    polarity: 'up_good',
    description:
      'Members of this unit who partook at communion services during the period, counted from attendance.',
    recordedAt: 'Events \u2014 services in the Communion category, with attendance taken',
  },
  {
    key: 'presidingElderVisits',
    label: 'Times presiding elder visited',
    source: 'visits',
    kind: 'count',
    polarity: 'up_good',
    description: 'Visits to this unit or its members by the presiding elder.',
    recordedAt: 'Attendance \u203a Visitations \u2014 visits logged as by the presiding elder',
  },
  {
    key: 'ministerVisitations',
    label: 'Visitations by minister',
    source: 'visits',
    kind: 'count',
    polarity: 'up_good',
    description: 'Visitations to this unit or its members carried out by a minister.',
    recordedAt: 'Attendance \u203a Visitations \u2014 visits logged as by a minister',
  },
  {
    key: 'convertsRehabilitated',
    label: 'Converts rehabilitated',
    source: 'history',
    kind: 'people',
    polarity: 'up_good',
    description:
      'Members who had fallen away and were restored to fellowship during the period.',
    recordedAt: 'Engagement & Follow-up \u2014 recorded when a backslider returns to active standing',
  },
  {
    key: 'interventionalSupport',
    label: 'Interventional support',
    source: 'finance',
    kind: 'currency',
    polarity: 'up_good',
    description:
      'Support given to members of this unit in need \u2014 medical bills, school fees, funerals \u2014 totalled from the payments made.',
    recordedAt: 'Finance \u2014 expenses marked as interventional support, with the member named',
  },
];

export const METRIC_KEYS = STAT_METRICS.map((m) => m.key);

const METRIC_INDEX: Record<string, MetricDefinition> = STAT_METRICS.reduce(
  (acc, m) => { acc[m.key] = m; return acc; },
  {} as Record<string, MetricDefinition>,
);

export const metricDefinition = (key: string): MetricDefinition | undefined => METRIC_INDEX[key];

export const isKnownMetric = (key: unknown): boolean =>
  typeof key === 'string' && Boolean(METRIC_INDEX[key]);

/** Money rather than a head count. Only interventional support. */
export const isCurrencyMetric = (key: string): boolean => METRIC_INDEX[key]?.kind === 'currency';

/**
 * Figures counted from things that happened inside the period, as opposed to
 * standing figures describing how the unit is at the end of it.
 *
 * Only the former can be opened to list the records behind them: "which
 * baptisms?" has an answer, while "which total membership?" does not.
 */
export const isPeriodMetric = (key: string): boolean => {
  const def = METRIC_INDEX[key];
  return Boolean(def) && !def.standing;
};

/* ------------------------------------------------------------------ */
/* Periods                                                            */
/* ------------------------------------------------------------------ */

export type Period = { from: Date; to: Date };

const startOfDay = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfDay = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Normalise a requested range into whole days.
 *
 * A range is inclusive of both ends: a church asking for 1 to 31 March means
 * the whole of the 31st, not up to midnight at its start. Reversed dates are
 * swapped rather than rejected, because a pair of date pickers makes that easy
 * to do by accident and the intent is never ambiguous.
 */
export function resolvePeriod(from?: string | Date | null, to?: string | Date | null): Period {
  const now = new Date();
  let start = from ? new Date(from) : null;
  let end = to ? new Date(to) : null;

  if (start && Number.isNaN(start.getTime())) start = null;
  if (end && Number.isNaN(end.getTime())) end = null;

  if (!start && !end) {
    end = now;
    start = new Date(now.getTime() - 29 * DAY_MS);
  } else if (!start) {
    start = new Date((end as Date).getTime() - 29 * DAY_MS);
  } else if (!end) {
    end = now;
  }

  if ((start as Date).getTime() > (end as Date).getTime()) {
    const swap = start as Date;
    start = end as Date;
    end = swap;
  }

  return { from: startOfDay(start as Date), to: endOfDay(end as Date) };
}

/**
 * The period immediately before this one, of the same length.
 *
 * "Previous" has to mean something precise for the comparison to be worth
 * anything. A 7-day range is compared against the 7 days before it, a quarter
 * against the quarter before it -- never against a calendar month of a
 * different length, which would make every variance an artefact of the calendar
 * rather than of the work.
 */
export function previousPeriod(period: Period): Period {
  const span = period.to.getTime() - period.from.getTime();
  const end = new Date(period.from.getTime() - 1);
  const start = new Date(end.getTime() - span);
  return { from: start, to: end };
}

/** Whole days covered by a period, counting both ends. */
export function periodDays(period: Period): number {
  return Math.max(1, Math.round((period.to.getTime() - period.from.getTime()) / DAY_MS));
}

export const formatPeriod = (period: Period): string =>
  `${period.from.toISOString().slice(0, 10)} to ${period.to.toISOString().slice(0, 10)}`;

/* ------------------------------------------------------------------ */
/* The comparison table                                               */
/* ------------------------------------------------------------------ */

export type StatisticRow = {
  key: string;
  label: string;
  source: MetricSource;
  sourceLabel: string;
  recordedAt: string;
  kind: MetricKind;
  polarity: MetricPolarity;
  description: string;
  standing: boolean;
  /** Whether the figure can be opened to list the records behind it. */
  hasRecords: boolean;
  current: number;
  previous: number;
  /** Current minus previous. Negative means a fall. */
  variance: number;
  /**
   * Percentage change, or null when there is nothing to compare against.
   *
   * Growth from zero is not "infinite" or "100%" -- it is simply not a
   * percentage, and inventing a number there would put something meaningless in
   * front of the people reading the sheet.
   */
  variancePercent: number | null;
  direction: 'up' | 'down' | 'flat';
  /** How the variance should be read, given what the figure counts. */
  sentiment: 'good' | 'bad' | 'neutral';
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Build one row of the return: this period, last period, and the movement. */
export function buildStatisticRow(
  metric: MetricDefinition,
  current: number,
  previous: number,
): StatisticRow {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  const variance = round1(cur - prev);
  const direction = variance > 0 ? 'up' : variance < 0 ? 'down' : 'flat';

  let sentiment: 'good' | 'bad' | 'neutral' = 'neutral';
  if (direction !== 'flat' && metric.polarity !== 'neutral') {
    const rising = direction === 'up';
    const risingIsGood = metric.polarity === 'up_good';
    sentiment = rising === risingIsGood ? 'good' : 'bad';
  }

  return {
    key: metric.key,
    label: metric.label,
    source: metric.source,
    sourceLabel: SOURCE_LABELS[metric.source],
    recordedAt: metric.recordedAt,
    kind: metric.kind,
    polarity: metric.polarity,
    description: metric.description,
    standing: Boolean(metric.standing),
    hasRecords: !metric.standing,
    current: round1(cur),
    previous: round1(prev),
    variance,
    variancePercent: prev === 0 ? null : round1(((cur - prev) / Math.abs(prev)) * 100),
    direction,
    sentiment,
  };
}

/**
 * Build the whole return from two sets of totals.
 *
 * Every metric appears, whether or not anything was counted against it: a sheet
 * with rows missing invites the reader to assume the figure was overlooked,
 * while an explicit zero says the unit recorded none.
 */
export function buildStatisticsTable(
  current: Record<string, number>,
  previous: Record<string, number>,
): StatisticRow[] {
  return STAT_METRICS.map((m) =>
    buildStatisticRow(m, current[m.key] || 0, previous[m.key] || 0));
}

/**
 * Narrow the return to rows matching a search box.
 *
 * The description and the source are searched as well as the label, so a leader
 * who types "communion" finds the Lord's Supper row without knowing which words
 * the sheet uses, and typing "finance" finds the figures drawn from finance.
 */
export function filterStatisticRows(rows: StatisticRow[], query?: string | null): StatisticRow[] {
  const q = (query || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    `${r.label} ${r.description} ${r.sourceLabel} ${r.recordedAt}`.toLowerCase().includes(q));
}

/** Headline figures for the cards above the table. */
export function summarizeStatistics(rows: StatisticRow[]): {
  membership: number;
  membershipVariance: number;
  growth: number;
  losses: number;
  meetings: number;
  support: number;
} {
  const at = (key: string) => rows.find((r) => r.key === key);
  const value = (key: string) => at(key)?.current || 0;

  return {
    membership: value('totalMembership'),
    membershipVariance: at('totalMembership')?.variance || 0,
    // What the unit gained, and what it lost. Kept as two figures rather than
    // one net number: a unit that won twelve souls and lost twelve members is
    // not standing still.
    growth: value('newConverts') + value('transfersIn') + value('convertsRehabilitated'),
    losses: value('transfersOut') + value('backsliders') + value('deaths'),
    meetings: value('meetingsHeld'),
    support: value('interventionalSupport'),
  };
}

/**
 * How complete the return is.
 *
 * Because every figure is counted rather than typed, a zero is ambiguous in one
 * specific way: it may mean nothing happened, or it may mean nobody has been
 * recording the underlying fact. Reporting how many figures have any data
 * behind them lets the page say which of the two it is, rather than presenting
 * an empty sheet as though the unit did nothing.
 */
export function coverage(rows: StatisticRow[]): {
  withData: number;
  total: number;
  emptyMetrics: string[];
} {
  const periodRows = rows.filter((r) => !r.standing);
  const empty = periodRows.filter((r) => r.current === 0 && r.previous === 0);
  return {
    withData: periodRows.length - empty.length,
    total: periodRows.length,
    emptyMetrics: empty.map((r) => r.label),
  };
}

/* ------------------------------------------------------------------ */
/* The records behind a figure                                        */
/* ------------------------------------------------------------------ */

/**
 * One record that contributed to a figure.
 *
 * Deliberately uniform across all the different sources, so the drill-down on
 * the page renders the same way whether it is showing baptisms from member
 * records, communion attendance, visits or payments.
 */
export type StatisticRecord = {
  /** What happened, usually a person's name. */
  title: string;
  /** When it happened, ISO. */
  date: string | null;
  /** How much this record contributed: one person, 84 communicants, an amount. */
  value: number;
  /** Where it is recorded, e.g. "Member record", "Communion service". */
  origin: string;
  /** Anything else worth showing: the church transferred from, the officiant. */
  detail?: string | null;
  /** The member this record concerns, so the page can link to them. */
  memberId?: string | null;
  /** The event, visit or expense the record came from. */
  sourceId?: string | null;
};

/** Sum a set of records, for cross-checking a drill-down against its figure. */
export function totalRecords(records: StatisticRecord[]): number {
  return round1((records || []).reduce((sum, r) => sum + (Number(r.value) || 0), 0));
}
