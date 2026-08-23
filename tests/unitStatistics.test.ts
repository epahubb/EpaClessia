import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STAT_METRICS,
  METRIC_KEYS,
  UNIT_TYPES,
  metricDefinition,
  isKnownMetric,
  isCurrencyMetric,
  isPeriodMetric,
  resolvePeriod,
  previousPeriod,
  periodDays,
  buildStatisticRow,
  buildStatisticsTable,
  filterStatisticRows,
  summarizeStatistics,
  coverage,
  totalRecords,
} from '../src/lib/unitStatistics';

/* ---- The catalogue ------------------------------------------------ */

test('the return carries all seventeen figures in filing order', () => {
  assert.equal(STAT_METRICS.length, 17);
  assert.deepEqual(METRIC_KEYS.slice(0, 4), [
    'totalMembership',
    'officers',
    'otherOfficeHolders',
    'newConverts',
  ]);
  assert.equal(METRIC_KEYS[16], 'interventionalSupport');
  // The order is part of the form: officers read these sheets top-to-bottom.
  assert.equal(new Set(METRIC_KEYS).size, 17);
});

test('every figure names the records it is counted from', () => {
  // The whole design rests on this: no figure may exist without a place in the
  // system where its underlying fact is recorded.
  for (const m of STAT_METRICS) {
    assert.ok(m.recordedAt && m.recordedAt.length > 5, `${m.key} must say where it is recorded`);
    assert.ok(m.description.length > 10, `${m.key} must say what it counts`);
    assert.ok(['roster', 'members', 'history', 'attendance', 'visits', 'finance'].includes(m.source));
  }
});

test('fourteen figures are counted from dated records, three from the roster', () => {
  const standing = STAT_METRICS.filter((m) => m.standing).map((m) => m.key);
  const dated = STAT_METRICS.filter((m) => !m.standing);

  // Only membership and the two office counts describe the unit as it stands.
  // Everything else -- including meetings held, which is counted from logged
  // attendance sessions -- happened on a particular day and can be listed.
  assert.equal(dated.length, 14);
  assert.deepEqual(standing, ['totalMembership', 'officers', 'otherOfficeHolders']);

  // Standing figures describe the unit as it is, so there is no list of events
  // behind them; the other thirteen can all be opened.
  assert.equal(isPeriodMetric('waterBaptism'), true);
  assert.equal(isPeriodMetric('totalMembership'), false);
  assert.equal(isPeriodMetric('meetingsHeld'), true);
});

test('only interventional support is money', () => {
  const currency = STAT_METRICS.filter((m) => m.kind === 'currency').map((m) => m.key);
  assert.deepEqual(currency, ['interventionalSupport']);
  assert.equal(isCurrencyMetric('interventionalSupport'), true);
  assert.equal(isCurrencyMetric('waterBaptism'), false);
});

test('unknown figures are rejected', () => {
  assert.equal(isKnownMetric('waterBaptism'), true);
  assert.equal(isKnownMetric('somethingElse'), false);
  assert.equal(isKnownMetric(undefined), false);
  assert.equal(metricDefinition('nope'), undefined);
});

test('units are ministries, departments and groups', () => {
  assert.deepEqual([...UNIT_TYPES], ['ministry', 'department', 'group']);
});

/* ---- Periods ------------------------------------------------------ */

test('a range covers whole days at both ends', () => {
  const period = resolvePeriod('2026-03-01', '2026-03-31');
  assert.equal(period.from.getHours(), 0);
  assert.equal(period.to.getHours(), 23);
  // A church asking for 1 to 31 March means the whole of the 31st.
  assert.equal(period.to.getDate(), 31);
  assert.equal(periodDays(period), 31);
});

test('a reversed range is swapped rather than refused', () => {
  const period = resolvePeriod('2026-03-31', '2026-03-01');
  assert.equal(period.from.getDate(), 1);
  assert.equal(period.to.getDate(), 31);
});

test('a missing or unparseable range falls back to thirty days', () => {
  for (const args of [[undefined, undefined], ['not a date', 'nonsense'], [null, null]] as any[]) {
    assert.equal(periodDays(resolvePeriod(args[0], args[1])), 30);
  }
});

test('the previous period is the equal span immediately before, with no overlap', () => {
  const period = resolvePeriod('2026-03-01', '2026-03-31');
  const prior = previousPeriod(period);

  // Equal length, so a variance reflects the work rather than the calendar: a
  // 31-day March compared against a 28-day February would show a fall for no
  // reason but the calendar.
  assert.equal(periodDays(prior), periodDays(period));
  assert.equal(period.from.getTime() - prior.to.getTime(), 1);
  assert.ok(prior.to.getTime() < period.from.getTime());
});

/* ---- Variance ----------------------------------------------------- */

const metric = (key: string) => metricDefinition(key)!;

test('variance is the movement, with its percentage', () => {
  const row = buildStatisticRow(metric('waterBaptism'), 12, 8);
  assert.equal(row.current, 12);
  assert.equal(row.previous, 8);
  assert.equal(row.variance, 4);
  assert.equal(row.variancePercent, 50);
  assert.equal(row.direction, 'up');
});

test('growth from nothing has no percentage', () => {
  const row = buildStatisticRow(metric('newConverts'), 9, 0);
  // Not "infinite" and not 100%: there genuinely is no percentage, and printing
  // one would put a meaningless number in front of the reader.
  assert.equal(row.variancePercent, null);
  assert.equal(row.variance, 9);
  assert.equal(row.sentiment, 'good');
});

test('a rise is only good news when the figure says so', () => {
  // Converts rising is good; backsliders rising is not.
  assert.equal(buildStatisticRow(metric('newConverts'), 10, 4).sentiment, 'good');
  assert.equal(buildStatisticRow(metric('backsliders'), 10, 4).sentiment, 'bad');
  assert.equal(buildStatisticRow(metric('backsliders'), 2, 9).sentiment, 'good');
  assert.equal(buildStatisticRow(metric('transfersOut'), 6, 1).sentiment, 'bad');

  // Neither direction is good news for a death, and officer counts are simply a
  // fact about the unit.
  assert.equal(buildStatisticRow(metric('deaths'), 4, 1).sentiment, 'neutral');
  assert.equal(buildStatisticRow(metric('officers'), 9, 3).sentiment, 'neutral');

  // Nothing moved, so nothing to colour.
  assert.equal(buildStatisticRow(metric('newConverts'), 5, 5).direction, 'flat');
  assert.equal(buildStatisticRow(metric('newConverts'), 5, 5).sentiment, 'neutral');
});

test('a figure counted from the roster carries no drill-down', () => {
  assert.equal(buildStatisticRow(metric('totalMembership'), 120, 118).hasRecords, false);
  assert.equal(buildStatisticRow(metric('waterBaptism'), 3, 1).hasRecords, true);
});

test('every figure appears even when nothing was recorded', () => {
  const rows = buildStatisticsTable({}, {});
  assert.equal(rows.length, 17);
  // A sheet with rows missing invites the reader to assume a figure was
  // overlooked; an explicit zero says the unit recorded none.
  assert.ok(rows.every((r) => r.current === 0 && r.previous === 0 && r.variance === 0));
});

test('each row says where its figure came from', () => {
  const rows = buildStatisticsTable({ interventionalSupport: 500 }, {});
  const support = rows.find((r) => r.key === 'interventionalSupport')!;
  assert.equal(support.source, 'finance');
  assert.equal(support.sourceLabel, 'Finance records');
  assert.ok(support.recordedAt.includes('Finance'));
});

/* ---- Searching and summarising ------------------------------------ */

test('the search box finds a figure by its wording or its source', () => {
  const rows = buildStatisticsTable({}, {});

  assert.deepEqual(filterStatisticRows(rows, 'baptism').map((r) => r.key), [
    'waterBaptism',
    'holySpiritBaptism',
  ]);

  // Someone who thinks "communion" finds the Lord's Supper row without knowing
  // which words the sheet uses.
  assert.deepEqual(filterStatisticRows(rows, 'communion').map((r) => r.key), [
    'lordsSupperAttendance',
  ]);

  // And searching by where the data lives works too.
  assert.ok(filterStatisticRows(rows, 'visitation log').length >= 2);
  assert.equal(filterStatisticRows(rows, 'ELDER').length >= 1, true);
  assert.equal(filterStatisticRows(rows, '').length, 17);
});

test('gains and losses are summarised separately', () => {
  const rows = buildStatisticsTable(
    {
      totalMembership: 100,
      newConverts: 6,
      transfersIn: 2,
      convertsRehabilitated: 1,
      transfersOut: 3,
      backsliders: 4,
      deaths: 1,
      meetingsHeld: 8,
      interventionalSupport: 750.5,
    },
    { totalMembership: 94 },
  );

  const summary = summarizeStatistics(rows);
  assert.equal(summary.membership, 100);
  assert.equal(summary.membershipVariance, 6);
  // Kept apart on purpose: a unit that won nine and lost eight is not standing
  // still, and a single net figure would say it was.
  assert.equal(summary.growth, 9);
  assert.equal(summary.losses, 8);
  assert.equal(summary.meetings, 8);
  assert.equal(summary.support, 750.5);
});

test('coverage distinguishes a quiet period from unkept records', () => {
  const empty = coverage(buildStatisticsTable({}, {}));
  assert.equal(empty.withData, 0);
  assert.equal(empty.total, 14);
  // Which is what lets the page say "nothing is being recorded" rather than
  // presenting an empty return as though the unit did nothing.
  assert.ok(empty.emptyMetrics.includes('Water baptism'));

  const some = coverage(buildStatisticsTable({ waterBaptism: 2 }, { deaths: 1 }));
  assert.equal(some.withData, 2);
  assert.ok(!some.emptyMetrics.includes('Water baptism'));
});

/* ---- The records behind a figure ---------------------------------- */

test('a drill-down totals to the figure it explains', () => {
  // Head counts contribute one apiece; money contributes its amount. This is
  // what lets the dialog be cross-checked against the number on the sheet.
  const people = [
    { title: 'Ama Mensah', date: '2026-03-04', value: 1, origin: 'Member record' },
    { title: 'Kofi Boateng', date: '2026-03-11', value: 1, origin: 'Member record' },
  ];
  assert.equal(totalRecords(people), 2);

  const payments = [
    { title: 'Ama Mensah', date: '2026-03-04', value: 400.25, origin: 'Expense record' },
    { title: 'Yaw Owusu', date: '2026-03-19', value: 99.75, origin: 'Expense record' },
  ];
  assert.equal(totalRecords(payments), 500);

  assert.equal(totalRecords([]), 0);
  assert.equal(totalRecords(null as any), 0);
});
