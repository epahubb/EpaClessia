import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  guessColumnMapping,
  normalizeHeader,
  parseImportDate,
  normalizeGender,
  normalizePhone,
  normalizeMembershipStatus,
  normalizeImportRow,
  validateImportRows,
  MAX_IMPORT_ROWS,
} from '../src/lib/memberImport';

test('normalizeHeader collapses punctuation and case', () => {
  assert.equal(normalizeHeader('First_Name'), 'first name');
  assert.equal(normalizeHeader('  E-MAIL  '), 'e mail');
  assert.equal(normalizeHeader(undefined), '');
});

test('guessColumnMapping matches common header spellings', () => {
  const mapping = guessColumnMapping(['First Name', 'Surname', 'Mobile Number', 'DOB']);
  assert.equal(mapping.firstName, 'First Name');
  assert.equal(mapping.lastName, 'Surname');
  assert.equal(mapping.phone, 'Mobile Number');
  assert.equal(mapping.dateOfBirth, 'DOB');
});

test('guessColumnMapping prefers the exact column over a similar one', () => {
  // "Phone Type" must not steal the mapping from "Phone".
  const mapping = guessColumnMapping(['First Name', 'Last Name', 'Phone Type', 'Phone']);
  assert.equal(mapping.phone, 'Phone');
});

test('guessColumnMapping never assigns one column to two fields', () => {
  const mapping = guessColumnMapping(['Name', 'Name']);
  const used = Object.values(mapping);
  assert.equal(new Set(used).size, used.length);
});

test('parseImportDate converts Excel serial numbers', () => {
  // 32964 is 1990-04-03 in Excel's serial calendar.
  assert.equal(parseImportDate(32964), '1990-04-03');
  // A known anchor: serial 1 is 1900-01-01.
  assert.equal(parseImportDate(1), '1900-01-01');
});

test('parseImportDate reads ambiguous text as day-first', () => {
  assert.equal(parseImportDate('03/04/1990'), '1990-04-03');
  assert.equal(parseImportDate('3-4-90'), '1990-04-03');
});

test('parseImportDate accepts ISO form unchanged', () => {
  assert.equal(parseImportDate('1990-04-03'), '1990-04-03');
  assert.equal(parseImportDate(new Date(Date.UTC(1990, 3, 3))), '1990-04-03');
});

test('parseImportDate rejects impossible calendar dates', () => {
  // JS Date would roll 31 February forward; we must refuse it instead.
  assert.equal(parseImportDate('31/02/1990'), null);
  assert.equal(parseImportDate('45/13/1990'), null);
});

test('parseImportDate returns null for blanks and nonsense', () => {
  assert.equal(parseImportDate(''), null);
  assert.equal(parseImportDate(null), null);
  assert.equal(parseImportDate('not a date'), null);
  assert.equal(parseImportDate(-5), null);
});

test('normalizeGender maps common spellings and refuses guesses', () => {
  assert.equal(normalizeGender('M'), 'male');
  assert.equal(normalizeGender('Female'), 'female');
  assert.equal(normalizeGender('Sister'), 'female');
  assert.equal(normalizeGender('unknown'), null);
  assert.equal(normalizeGender(''), null);
});

test('normalizePhone restores the zero Excel strips from local numbers', () => {
  assert.equal(normalizePhone(244123456), '0244123456');
  assert.equal(normalizePhone('024 412 3456'), '0244123456');
  assert.equal(normalizePhone('+233 24 412 3456'), '+233244123456');
});

test('normalizePhone rejects scientific notation from mangled cells', () => {
  assert.equal(normalizePhone('2.33244E+11'), null);
  assert.equal(normalizePhone(''), null);
});

test('normalizeMembershipStatus defaults to active', () => {
  assert.equal(normalizeMembershipStatus('Dormant'), 'inactive');
  assert.equal(normalizeMembershipStatus('transferred'), 'transferred');
  assert.equal(normalizeMembershipStatus(''), 'active');
  assert.equal(normalizeMembershipStatus('anything else'), 'active');
});

test('normalizeImportRow requires both names', () => {
  const mapping = { firstName: 'A', lastName: 'B' };
  const result = normalizeImportRow({ A: '', B: 'Mensah' }, mapping, 2);
  assert.equal(result.member, undefined);
  assert.ok(result.errors.some((e) => e.includes('First name')));
});

test('normalizeImportRow rejects a malformed email', () => {
  const mapping = { firstName: 'A', lastName: 'B', email: 'C' };
  const result = normalizeImportRow({ A: 'Ama', B: 'Mensah', C: 'not-an-email' }, mapping, 2);
  assert.equal(result.member, undefined);
  assert.ok(result.errors.some((e) => e.includes('valid email')));
});

test('normalizeImportRow rejects a future birth date', () => {
  const mapping = { firstName: 'A', lastName: 'B', dateOfBirth: 'C' };
  const result = normalizeImportRow({ A: 'Ama', B: 'Mensah', C: '2999-01-01' }, mapping, 2);
  assert.ok(result.errors.some((e) => e.includes('future')));
});

test('normalizeImportRow warns instead of failing on unrecognised gender', () => {
  const mapping = { firstName: 'A', lastName: 'B', gender: 'C' };
  const result = normalizeImportRow({ A: 'Ama', B: 'Mensah', C: 'n/a' }, mapping, 2);
  assert.ok(result.member, 'row should still import');
  assert.equal(result.member?.gender, null);
  assert.equal(result.warnings.length, 1);
});

test('normalizeImportRow trims whitespace and normalises values', () => {
  const mapping = { firstName: 'A', lastName: 'B', phone: 'C', membershipStatus: 'D' };
  const result = normalizeImportRow(
    { A: '  Ama  ', B: 'Mensah\n', C: 244123456, D: 'Dormant' },
    mapping,
    2,
  );
  assert.equal(result.member?.firstName, 'Ama');
  assert.equal(result.member?.lastName, 'Mensah');
  assert.equal(result.member?.phone, '0244123456');
  assert.equal(result.member?.membershipStatus, 'inactive');
});

test('validateImportRows fails fast when a required column is unmapped', () => {
  const result = validateImportRows([{ A: 'Ama' }], { firstName: 'A' });
  assert.ok(result.fatalErrors.some((e) => e.includes('Last name')));
  assert.equal(result.validRows.length, 0);
});

test('validateImportRows rejects an empty sheet', () => {
  const result = validateImportRows([], { firstName: 'A', lastName: 'B' });
  assert.ok(result.fatalErrors.some((e) => e.includes('no data rows')));
});

test('validateImportRows enforces the row ceiling', () => {
  const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => ({ A: 'Ama', B: 'Mensah' }));
  const result = validateImportRows(rows, { firstName: 'A', lastName: 'B' });
  assert.ok(result.fatalErrors.some((e) => e.includes('exceeds the limit')));
});

test('validateImportRows separates good rows from bad and numbers them', () => {
  const rows = [
    { A: 'Ama', B: 'Mensah' },
    { A: '', B: 'Otu' },
    { A: 'Kofi', B: 'Boateng' },
  ];
  const result = validateImportRows(rows, { firstName: 'A', lastName: 'B' });
  assert.equal(result.validRows.length, 2);
  assert.equal(result.invalidRows.length, 1);
  // Spreadsheet row 3, because row 1 is the header.
  assert.equal(result.invalidRows[0].rowNumber, 3);
});

test('validateImportRows flags emails duplicated inside the file without rejecting them', () => {
  const rows = [
    { A: 'Ama', B: 'Mensah', C: 'family@example.com' },
    { A: 'Kofi', B: 'Mensah', C: 'FAMILY@example.com' },
  ];
  const result = validateImportRows(rows, { firstName: 'A', lastName: 'B', email: 'C' });
  assert.equal(result.validRows.length, 2, 'shared family emails are legitimate');
  assert.deepEqual(result.duplicateEmails, ['family@example.com']);
  assert.ok(result.rows[1].warnings.some((w) => w.includes('row 2')));
});
