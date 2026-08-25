/**
 * Tests for what a statistical return is measured against.
 *
 * The variance is the number leaders actually read, so what sits in the
 * "previous" column decides whether the sheet tells the truth. Comparing a
 * December against a November is not wrong arithmetic, it is the wrong question;
 * comparing it against last December is the one a church means.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPARISON_MODES,
  isComparisonMode,
  comparisonModeLabel,
  comparisonPeriod,
  sameperiodLastYear,
  previousPeriod,
  resolvePeriod,
  periodDays,
  buildStatisticRow,
  metricDefinition,
  type Period,
} from '../src/lib/unitStatistics';

const day = (value: string) => new Date(value);

/** The definition behind a figure, which is what a row is built from. */
const metric = (key: string) => metricDefinition(key)!;

/** A calendar year, the commonest thing a church compares. */
const thisYear = (): Period =>
  resolvePeriod('2026-01-01', '2026-12-31');

test('three comparisons are offered, and nothing else is accepted', () => {
  assert.deepEqual(
    COMPARISON_MODES.map((m) => m.value),
    ['previous_period', 'previous_year', 'custom'],
  );
  assert.equal(isComparisonMode('previous_year'), true);
  assert.equal(isComparisonMode('last_quarter'), false);
  assert.equal(comparisonModeLabel('previous_year'), 'The same period last year');
});

test('last year means the same dates, not 365 days back', () => {
  // Subtracting days would slide a year comparison off the calendar and put
  // "January to March" against "January to March less a day".
  const period = thisYear();
  const prior = sameperiodLastYear(period);
  assert.equal(prior.from.getFullYear(), 2025);
  assert.equal(prior.from.getMonth(), 0);
  assert.equal(prior.from.getDate(), 1);
  assert.equal(prior.to.getFullYear(), 2025);
  assert.equal(prior.to.getMonth(), 11);
  assert.equal(prior.to.getDate(), 31);
});

test('a year-on-year comparison holds across a leap year', () => {
  // 2024 had a 29th of February; a day-arithmetic shift from 2025 would land on
  // the wrong dates either side of it.
  const period = resolvePeriod('2025-03-01', '2025-03-31');
  const prior = sameperiodLastYear(period);
  assert.equal(prior.from.toISOString().slice(0, 10), '2024-03-01');
  assert.equal(prior.to.toISOString().slice(0, 10), '2024-03-31');
});

test('the period just before is the same length, ending the moment this one begins', () => {
  const period = resolvePeriod('2026-06-01', '2026-06-30');
  const prior = previousPeriod(period);
  assert.ok(prior.to.getTime() < period.from.getTime());
  // Same span, so the two columns are counting over comparable ground.
  assert.equal(periodDays(prior), periodDays(period));
});

test('the default comparison is the period just before', () => {
  const period = resolvePeriod('2026-06-01', '2026-06-30');
  assert.deepEqual(comparisonPeriod(period), previousPeriod(period));
  assert.deepEqual(comparisonPeriod(period, 'previous_period'), previousPeriod(period));
});

test('a year-on-year comparison is routed to the calendar shift', () => {
  const period = thisYear();
  assert.deepEqual(comparisonPeriod(period, 'previous_year'), sameperiodLastYear(period));
});

test('a comparison of your own dates need not be the same length', () => {
  // A church comparing this quarter against the whole of a difficult year is
  // asking a legitimate question, and the sheet should not straighten it out.
  const period = resolvePeriod('2026-07-01', '2026-09-30');
  const prior = comparisonPeriod(period, 'custom', '2024-01-01', '2024-12-31');
  assert.equal(prior.from.toISOString().slice(0, 10), '2024-01-01');
  assert.equal(prior.to.toISOString().slice(0, 10), '2024-12-31');
  assert.ok(periodDays(prior) > periodDays(period));
});

test('a chosen comparison with no dates falls back rather than failing', () => {
  // The table must always have a second column: a half-filled form should not
  // leave a leader with a blank sheet.
  const period = resolvePeriod('2026-07-01', '2026-09-30');
  assert.deepEqual(comparisonPeriod(period, 'custom'), previousPeriod(period));
});

test('a chosen comparison entered back to front is straightened out', () => {
  const period = resolvePeriod('2026-07-01', '2026-09-30');
  const prior = comparisonPeriod(period, 'custom', '2025-09-30', '2025-07-01');
  assert.ok(prior.from.getTime() < prior.to.getTime());
});

test('the variance is the current figure less the earlier one', () => {
  const grew = buildStatisticRow(metric('newConverts'), 41, 25);
  assert.equal(grew.current, 41);
  assert.equal(grew.previous, 25);
  assert.equal(grew.variance, 16);

  const fell = buildStatisticRow(metric('newConverts'), 12, 30);
  assert.equal(fell.variance, -18);

  const flat = buildStatisticRow(metric('newConverts'), 7, 7);
  assert.equal(flat.variance, 0);
  assert.equal(flat.direction, 'flat');
});

test('a rise is read for what it means, not for its direction', () => {
  // More converts is good news; more deaths is not. A sheet that paints both
  // green teaches leaders to stop reading the colour.
  assert.equal(buildStatisticRow(metric('newConverts'), 20, 10).sentiment, 'good');
  assert.equal(buildStatisticRow(metric('backsliders'), 9, 2).sentiment, 'bad');
  // A death is neither good news nor bad news to be coloured; it is simply a
  // fact, and the sheet says so.
  assert.equal(buildStatisticRow(metric('deaths'), 4, 1).sentiment, 'neutral');
});

test('growth from nothing carries no percentage', () => {
  // A percentage against zero is infinite, and printing one would be inventing
  // a number for the people reading the return.
  const row = buildStatisticRow(metric('waterBaptism'), 15, 0);
  assert.equal(row.variance, 15);
  assert.equal(row.variancePercent, null);
});

test('the comparison never moves the current period', () => {
  const period = thisYear();
  const before = { from: day(period.from.toISOString()), to: day(period.to.toISOString()) };
  comparisonPeriod(period, 'previous_year');
  comparisonPeriod(period, 'custom', '2020-01-01', '2020-12-31');
  assert.equal(period.from.getTime(), before.from.getTime());
  assert.equal(period.to.getTime(), before.to.getTime());
});
