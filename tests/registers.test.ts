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
  acceptsDocuments,
  resolveDocumentKind,
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
      'birth',
      'child_dedication',
      'death',
      'promotion',
      'demotion',
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
    // A member has to be named, or the entry cannot reach a record. Which
    // member differs by register: a birth or a dedication hangs from the
    // parent, because the child may have no record of their own yet.
    const member = def.fields.find((f) => f.name === def.memberField);
    assert.ok(member, `${def.key} names a member field it does not collect`);
    assert.equal(member!.type, 'member', `${def.key} member field is not a member picker`);
    assert.equal(member!.required, true, `${def.key} does not require a member`);
  }
});

test('the registers that move a figure name the figure they move', () => {
  const counted = REGISTER_DEFINITIONS.filter((d) => d.countsAs.length > 0).map((d) => d.key);
  assert.deepEqual(counted.sort(), [
    'converts',
    'death',
    'demotion',
    'holy_spirit_baptism',
    'promotion',
    'transfer_in',
    'transfer_out',
    'water_baptism',
  ]);
  // The family registers are kept for their own sake: a marriage, a birth and a
  // dedication are events in a member's life that no figure on the return asks
  // about, and inventing one for them would be inventing a statistic.
  for (const key of ['marriage', 'birth', 'child_dedication'] as const) {
    assert.deepEqual(registerDefinition(key)!.countsAs, []);
  }
  // A change of office moves the officer counts, which are read off the roster.
  assert.deepEqual(registerDefinition('promotion')!.countsAs, [
    'Officers',
    'Other office holders',
  ]);
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

/* ---------------------------------------------------------------------- */
/* Dropdowns, paperwork and the certificate                               */
/* ---------------------------------------------------------------------- */

test('a converts class is chosen from the church\u2019s own intakes', () => {
  const field = registerDefinition('converts')!.fields.find((f) => f.name === 'convertClassId')!;
  assert.equal(field.type, 'select');
  assert.equal(field.optionSource, 'convert_classes');
  // No fixed list: the church names its own intakes, so the choices can only
  // come from its records.
  assert.equal(field.options, undefined);
});

test('the counsellor on a converts entry is a member, not typed-in text', () => {
  const field = registerDefinition('converts')!.fields.find(
    (f) => f.name === 'counsellorMemberId',
  )!;
  assert.equal(field.type, 'member');
});

test('an office on a promotion is chosen from the offices the church spelt out', () => {
  for (const key of ['promotion', 'demotion'] as const) {
    const field = registerDefinition(key)!.fields.find((f) => f.name === 'toOffice')!;
    assert.equal(field.optionSource, 'offices');
  }
});

test('a dropdown filled from the church\u2019s records is not judged against a fixed list', () => {
  // The validator cannot know the church's class ids, so checking them here
  // would reject every real class.
  const check = validateRegisterEntry(
    'converts',
    { memberId: 'm1', convertDate: '2026-03-01', convertClassId: 'cclassgrp_abc' },
    NOW,
  );
  assert.equal(check.ok, true, check.errors.join('; '));
});

test('paperwork is offered on every register where a church holds papers', () => {
  const withDocs = REGISTER_DEFINITIONS.filter((d) => acceptsDocuments(d.key)).map((d) => d.key);
  assert.deepEqual(withDocs.sort(), [
    'birth',
    'child_dedication',
    'death',
    'demotion',
    'marriage',
    'promotion',
    'transfer_in',
    'transfer_out',
    'water_baptism',
  ]);
  // A converts class and a Holy Spirit baptism produce no paper, so none is
  // asked for.
  assert.equal(acceptsDocuments('converts'), false);
  assert.equal(acceptsDocuments('holy_spirit_baptism'), false);
});

test('a transfer or a death is filed whether or not the paper has arrived', () => {
  // The document must never gate the fact: a member released today is off the
  // roll today, even if the letter is written next week.
  for (const def of REGISTER_DEFINITIONS.filter((d) => acceptsDocuments(d.key))) {
    assert.ok(
      !def.fields.some((f) => f.required && f.name.toLowerCase().includes('document')),
      `${def.key} makes paperwork compulsory`,
    );
  }
  const transfer = validateRegisterEntry(
    'transfer_out',
    { memberId: 'm1', transferOutDate: '2026-06-01', transferredTo: 'Grace Chapel, Kumasi' },
    NOW,
  );
  assert.equal(transfer.ok, true, transfer.errors.join('; '));

  const death = validateRegisterEntry('death', { memberId: 'm1', dateOfDeath: '2026-07-04' }, NOW);
  assert.equal(death.ok, true, death.errors.join('; '));
});

test('a death takes the several papers a bereavement actually produces', () => {
  const kinds = registerDefinition('death')!.documentKinds!.map((k) => k.value);
  assert.deepEqual(kinds, ['certificate', 'burial_permit', 'obituary', 'other']);
});

test('only the baptism register follows a certificate through to delivery', () => {
  const tracking = REGISTER_DEFINITIONS.filter((d) => d.tracksCertificate).map((d) => d.key);
  assert.deepEqual(tracking, ['water_baptism']);
  assert.ok(
    registerDefinition('water_baptism')!.documentKinds!.some((k) => k.value === 'certificate'),
  );
});

test('a paper we have no label for is filed rather than refused', () => {
  // Losing a document because there was no name for it would be worse than
  // filing it under "other".
  assert.equal(resolveDocumentKind('transfer_in', 'transfer_letter'), 'transfer_letter');
  assert.equal(resolveDocumentKind('death', 'coroner report'), 'other');
  assert.equal(resolveDocumentKind('death', undefined), 'other');
  assert.equal(resolveDocumentKind('converts', 'certificate'), 'other');
});

/* ---------------------------------------------------------------------- */
/* The four new registers                                                 */
/* ---------------------------------------------------------------------- */

test('a birth names the child, the date and a parent on the roll', () => {
  const good = validateRegisterEntry(
    'birth',
    { parentMemberId: 'm1', childName: 'Kofi Mensah', dateOfBirth: '2026-04-01' },
    NOW,
  );
  assert.equal(good.ok, true, good.errors.join('; '));

  const bare = validateRegisterEntry('birth', {}, NOW);
  assert.equal(bare.errors.length, 3);
});

test('a child cannot be born tomorrow', () => {
  const check = validateRegisterEntry(
    'birth',
    { parentMemberId: 'm1', childName: 'Kofi', dateOfBirth: '2027-01-01' },
    NOW,
  );
  assert.ok(check.errors.some((e) => e.includes('cannot be in the future')));
});

test('one member cannot be both parents of the same child', () => {
  const check = validateRegisterEntry(
    'birth',
    {
      parentMemberId: 'm1',
      secondParentMemberId: 'm1',
      childName: 'Kofi',
      dateOfBirth: '2026-04-01',
    },
    NOW,
  );
  assert.ok(check.errors.includes('The two parents cannot be the same member.'));
});

test('a child cannot be dedicated before they were born', () => {
  const check = validateRegisterEntry(
    'child_dedication',
    {
      parentMemberId: 'm1',
      childName: 'Kofi',
      childDateOfBirth: '2026-04-01',
      dedicationDate: '2026-03-01',
    },
    NOW,
  );
  assert.ok(check.errors.includes('A child cannot be dedicated before they were born.'));
});

test('a promotion must say which office; a demotion need not', () => {
  // Stepping out of office altogether is a real event, and it is recorded by
  // leaving the new office empty.
  const promotion = validateRegisterEntry(
    'promotion',
    { memberId: 'm1', effectiveDate: '2026-01-11' },
    NOW,
  );
  assert.equal(promotion.ok, false);

  const demotion = validateRegisterEntry(
    'demotion',
    { memberId: 'm1', effectiveDate: '2026-01-11' },
    NOW,
  );
  assert.equal(demotion.ok, true, demotion.errors.join('; '));
});

test('the summary strip covers all eleven registers, quiet ones at zero', () => {
  const summary = summarizeRegisters({ water_baptism: 12, birth: 3 });
  assert.equal(summary.length, REGISTER_KEYS.length);
  assert.equal(summary.find((s) => s.key === 'birth')!.count, 3);
  assert.equal(summary.find((s) => s.key === 'demotion')!.count, 0);
});
