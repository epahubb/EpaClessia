import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REGISTER_KEYS,
  REGISTER_DEFINITIONS,
  registerDefinition,
  isRegisterKey,
  registerDateFields,
  validateRegisterEntry,
  filterRegisterEntries,
  summarizeRegisters,
  type RegisterEntry,
} from '../src/lib/registers';

const NOW = new Date('2026-08-23T12:00:00Z');

test('every register the church asked for has a book', () => {
  assert.deepEqual(
    [...REGISTER_KEYS],
    [
      'converts',
      'water_baptism',
      'holy_spirit_baptism',
      'transfer_in',
      'transfer_out',
      'marriage',
      'death',
    ],
  );
  assert.equal(REGISTER_DEFINITIONS.length, REGISTER_KEYS.length);
  assert.equal(new Set(REGISTER_DEFINITIONS.map((d) => d.key)).size, REGISTER_KEYS.length);
});

test('every register says what an entry writes and where it lands', () => {
  for (const def of REGISTER_DEFINITIONS) {
    assert.ok(def.writes.length > 0, `${def.key} does not say what it writes`);
    assert.ok(def.description.length > 20, `${def.key} has no description`);
    // The register must be able to order itself by a date it collects.
    assert.ok(
      registerDateFields(def.key).includes(def.primaryDateField),
      `${def.key} does not collect its own primary date`,
    );
    // A member has to be named, or the entry cannot reach a record.
    assert.ok(
      def.fields.some((f) => f.name === 'memberId' && f.required),
      `${def.key} does not require a member`,
    );
  }
});

test('the registers that move a figure name the figure they move', () => {
  const counted = REGISTER_DEFINITIONS.filter((d) => d.countsAs.length > 0).map((d) => d.key);
  // Marriage is the one register with no figure on the statistical return.
  assert.deepEqual(counted.sort(), [
    'converts',
    'death',
    'holy_spirit_baptism',
    'transfer_in',
    'transfer_out',
    'water_baptism',
  ]);
  assert.deepEqual(registerDefinition('marriage')!.countsAs, []);
});

test('the three registers that take a member off the roll are flagged as such', () => {
  const standing = REGISTER_DEFINITIONS.filter((d) => d.changesStanding).map((d) => d.key);
  assert.deepEqual(standing.sort(), ['death', 'transfer_in', 'transfer_out']);
});

test('unknown registers are refused rather than guessed at', () => {
  assert.equal(isRegisterKey('water_baptism'), true);
  assert.equal(isRegisterKey('dedication'), false);
  assert.equal(registerDefinition('dedication'), undefined);
  assert.deepEqual(validateRegisterEntry('dedication', {}, NOW), {
    ok: false,
    errors: ['Unknown register.'],
  });
});

test('a required field left empty is named in the complaint', () => {
  const check = validateRegisterEntry('water_baptism', {}, NOW);
  assert.equal(check.ok, false);
  assert.ok(check.errors.includes('Candidate is required.'));
  assert.ok(check.errors.includes('Date of baptism is required.'));
});

test('a good entry passes', () => {
  const check = validateRegisterEntry(
    'water_baptism',
    { memberId: 'm1', waterBaptismDate: '2026-08-16', officiantName: 'Rev. Mensah' },
    NOW,
  );
  assert.deepEqual(check, { ok: true, errors: [] });
});

test('an entry filed earlier today is not rejected as being in the future', () => {
  const check = validateRegisterEntry(
    'water_baptism',
    { memberId: 'm1', waterBaptismDate: '2026-08-23' },
    NOW,
  );
  assert.equal(check.ok, true);
});

test('a baptism cannot be dated ahead of the day it is filed', () => {
  const check = validateRegisterEntry(
    'water_baptism',
    { memberId: 'm1', waterBaptismDate: '2026-09-01' },
    NOW,
  );
  assert.equal(check.ok, false);
  assert.ok(check.errors.includes('Date of baptism cannot be in the future.'));
});

test('a funeral may be dated ahead, because it usually is', () => {
  const check = validateRegisterEntry(
    'death',
    { memberId: 'm1', dateOfDeath: '2026-08-20', funeralDate: '2026-09-12' },
    NOW,
  );
  assert.equal(check.ok, true);
});

test('an unreadable date is called out instead of being stored as nothing', () => {
  const check = validateRegisterEntry(
    'death',
    { memberId: 'm1', dateOfDeath: 'last Tuesday' },
    NOW,
  );
  assert.equal(check.ok, false);
  assert.ok(check.errors.includes('Date of death is not a date we can read.'));
});

test('a transfer must say which congregation is on the other side of it', () => {
  const out = validateRegisterEntry(
    'transfer_out',
    { memberId: 'm1', transferOutDate: '2026-08-01' },
    NOW,
  );
  assert.equal(out.ok, false);
  assert.ok(out.errors.includes('Transferred to is required.'));

  const inbound = validateRegisterEntry(
    'transfer_in',
    { memberId: 'm1', transferInDate: '2026-08-01', transferredFrom: 'Grace Chapel, Kumasi' },
    NOW,
  );
  assert.equal(inbound.ok, true);
});

test('a marriage needs a spouse, named or chosen', () => {
  const bare = validateRegisterEntry(
    'marriage',
    { memberId: 'm1', weddingDate: '2026-07-04' },
    NOW,
  );
  assert.equal(bare.ok, false);
  assert.ok(bare.errors.includes('Name the spouse, or choose them if they are a member here.'));

  const typed = validateRegisterEntry(
    'marriage',
    { memberId: 'm1', weddingDate: '2026-07-04', spouseName: 'Ama Owusu' },
    NOW,
  );
  assert.equal(typed.ok, true);

  const linked = validateRegisterEntry(
    'marriage',
    { memberId: 'm1', weddingDate: '2026-07-04', spouseMemberId: 'm2' },
    NOW,
  );
  assert.equal(linked.ok, true);
});

test('nobody is married to themselves, and nobody wins themselves', () => {
  const self = validateRegisterEntry(
    'marriage',
    { memberId: 'm1', weddingDate: '2026-07-04', spouseMemberId: 'm1' },
    NOW,
  );
  assert.equal(self.ok, false);
  assert.ok(self.errors.includes('A member cannot be married to themselves.'));

  const won = validateRegisterEntry(
    'converts',
    { memberId: 'm1', convertDate: '2026-08-02', wonByMemberId: 'm1' },
    NOW,
  );
  assert.equal(won.ok, false);
  assert.ok(won.errors.includes('A convert cannot be credited with winning themselves.'));
});

test('a marriage type off the list is refused', () => {
  const check = validateRegisterEntry(
    'marriage',
    { memberId: 'm1', spouseName: 'Ama', weddingDate: '2026-07-04', marriageType: 'elopement' },
    NOW,
  );
  assert.equal(check.ok, false);
  assert.ok(check.errors.includes('Type is not one of the choices offered.'));
});

test('a converts class cannot finish before it starts', () => {
  const check = validateRegisterEntry(
    'converts',
    {
      memberId: 'm1',
      convertDate: '2026-05-01',
      classStartDate: '2026-06-01',
      classCompletedDate: '2026-05-15',
    },
    NOW,
  );
  assert.equal(check.ok, false);
  assert.ok(check.errors.includes('The class cannot be completed before it started.'));
});

test('a convert still in class is a complete entry', () => {
  const check = validateRegisterEntry(
    'converts',
    {
      memberId: 'm1',
      convertDate: '2026-05-01',
      className: 'Foundations, May intake',
      classStartDate: '2026-05-10',
      wonByMemberId: 'm2',
    },
    NOW,
  );
  assert.equal(check.ok, true);
});

const ENTRIES: RegisterEntry[] = [
  {
    id: 'm1',
    memberId: 'm1',
    memberName: 'Kwesi Boateng',
    date: '2026-08-16T00:00:00.000Z',
    detail: 'From Grace Chapel, Kumasi',
    particulars: [{ label: 'Transferred from', value: 'Grace Chapel, Kumasi' }],
    origin: 'Member record',
    notes: null,
  },
  {
    id: 'm2',
    memberId: 'm2',
    memberName: 'Adjoa Mensah',
    date: '2026-07-02T00:00:00.000Z',
    detail: 'From Calvary Assembly',
    particulars: [{ label: 'Transferred from', value: 'Calvary Assembly' }],
    origin: 'Member record',
    notes: 'Letter of commendation held on file',
  },
];

test('searching a register reaches the name, the particulars and the notes', () => {
  assert.equal(filterRegisterEntries(ENTRIES, '').length, 2);
  assert.deepEqual(
    filterRegisterEntries(ENTRIES, 'kumasi').map((e) => e.id),
    ['m1'],
  );
  assert.deepEqual(
    filterRegisterEntries(ENTRIES, 'adjoa').map((e) => e.id),
    ['m2'],
  );
  assert.deepEqual(
    filterRegisterEntries(ENTRIES, 'commendation').map((e) => e.id),
    ['m2'],
  );
  assert.deepEqual(
    filterRegisterEntries(ENTRIES, 'transferred from').map((e) => e.id),
    ['m1', 'm2'],
  );
  assert.deepEqual(filterRegisterEntries(ENTRIES, 'baptism'), []);
});

test('the summary strip lists every register, quiet ones at zero', () => {
  const summary = summarizeRegisters({ water_baptism: 12, death: 2 });
  assert.equal(summary.length, REGISTER_KEYS.length);
  assert.deepEqual(
    summary.map((s) => s.key),
    [...REGISTER_KEYS],
  );
  assert.equal(summary.find((s) => s.key === 'water_baptism')!.count, 12);
  assert.equal(summary.find((s) => s.key === 'marriage')!.count, 0);
  assert.equal(summary.find((s) => s.key === 'water_baptism')!.label, 'Water baptism');
});
