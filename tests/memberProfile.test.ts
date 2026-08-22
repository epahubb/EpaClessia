import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPartnered,
  normalizeEducation,
  normalizeChildren,
  normalizeMedical,
  normalizeMinistryIds,
  parseJsonColumn,
  toJsonColumn,
} from '../src/lib/memberProfile';
import {
  getPortalProfile,
  hasMemberSection,
  MEMBER_SECTIONS,
  DENOMINATION_IDS,
} from '../src/lib/denominations';

/* --- Marital status ------------------------------------------------- */

test('spouse details are only collected for a partnered member', () => {
  assert.equal(isPartnered('married'), true);
  assert.equal(isPartnered('Married'), true);
  assert.equal(isPartnered('engaged'), true);
  assert.equal(isPartnered('single'), false);
  assert.equal(isPartnered('widowed'), false);
  assert.equal(isPartnered('divorced'), false);
  assert.equal(isPartnered(undefined), false);
});

/* --- Education ------------------------------------------------------ */

test('normalizeEducation keeps real entries and drops abandoned rows', () => {
  const rows = normalizeEducation([
    { school: ' University of Ghana ', certificate: 'BSc Nursing', level: 'bachelors' },
    // Nothing identifying: a row the user started and left blank.
    { school: '', certificate: '', level: 'shs' },
    // A certificate with no school is still worth keeping.
    { certificate: 'WASSCE' },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].school, 'University of Ghana');
  assert.equal(rows[0].certificate, 'BSc Nursing');
  assert.equal(rows[1].certificate, 'WASSCE');
  assert.equal(rows[1].school, '');
});

test('normalizeEducation accepts a JSON string from the database', () => {
  const rows = normalizeEducation('[{"school":"Bible College","certificate":"Diploma"}]');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].school, 'Bible College');
});

/* --- Children ------------------------------------------------------- */

test('a dedication date is only kept for a dedicated child', () => {
  const rows = normalizeChildren([
    { name: 'Ama', dateOfBirth: '2015-04-02', dedicated: true, dedicationDate: '2015-06-14' },
    // Un-ticking dedication must not leave the old date behind.
    { name: 'Kofi', dateOfBirth: '2019-01-09', dedicated: false, dedicationDate: '2019-03-01' },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].dedicationDate, '2015-06-14');
  assert.equal(rows[1].dedicated, false);
  assert.equal(rows[1].dedicationDate, '');
});

test('children without a name are not saved', () => {
  const rows = normalizeChildren([{ name: '', dateOfBirth: '2020-01-01' }, { name: 'Yaa' }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Yaa');
});

test('a child who is a member keeps the link to their own record', () => {
  const rows = normalizeChildren([{ name: 'Ama', memberId: 'member_123' }]);
  assert.equal(rows[0].memberId, 'member_123');
});

/* --- Medical -------------------------------------------------------- */

test('an untouched medical section is stored as nothing', () => {
  assert.equal(normalizeMedical({}), null);
  assert.equal(normalizeMedical({ bloodGroup: '', allergies: '   ' }), null);
  assert.equal(normalizeMedical(null), null);
});

test('normalizeMedical keeps details once anything is filled in', () => {
  const medical = normalizeMedical({
    bloodGroup: 'O+',
    emergencyContactPhone: ' 0244000000 ',
    bloodTransfusionConsent: 'true',
  });
  assert.ok(medical);
  assert.equal(medical!.bloodGroup, 'O+');
  assert.equal(medical!.emergencyContactPhone, '0244000000');
  assert.equal(medical!.bloodTransfusionConsent, true);
  assert.equal(medical!.allergies, '');
});

/* --- Ministries ----------------------------------------------------- */

test('ministry ids are de-duplicated and accept a comma-separated string', () => {
  assert.deepEqual(normalizeMinistryIds(['a', 'b', 'a', '']), ['a', 'b']);
  assert.deepEqual(normalizeMinistryIds('choir, ushers'), ['choir', 'ushers']);
  assert.deepEqual(normalizeMinistryIds(undefined), []);
});

/* --- JSON columns --------------------------------------------------- */

test('a malformed JSON column does not break loading a member', () => {
  assert.deepEqual(parseJsonColumn('{not json', []), []);
  assert.deepEqual(parseJsonColumn('', []), []);
  assert.deepEqual(parseJsonColumn(null, []), []);
  assert.deepEqual(parseJsonColumn('[1,2]', []), [1, 2]);
});

test('empty lists are stored as null rather than an empty array', () => {
  assert.equal(toJsonColumn([]), null);
  assert.equal(toJsonColumn(null), null);
  assert.equal(toJsonColumn([{ name: 'Ama' }]), '[{"name":"Ama"}]');
});

/* --- Which denominations ask for these sections ---------------------- */

test('Pentecostal & Charismatic churches register the extended member record', () => {
  const profile = getPortalProfile('pentecostal_charismatic');
  assert.deepEqual(profile.memberSections, MEMBER_SECTIONS);
  for (const section of MEMBER_SECTIONS) {
    assert.equal(hasMemberSection('pentecostal_charismatic', section), true);
  }
});

test('other denominations keep the core member form until described', () => {
  for (const id of DENOMINATION_IDS.filter((d) => d !== 'pentecostal_charismatic')) {
    assert.deepEqual(getPortalProfile(id).memberSections, [], id);
  }
});

test('every denomination still reaches every area of the portal', () => {
  const full = getPortalProfile('pentecostal_charismatic').features;
  for (const id of DENOMINATION_IDS) {
    assert.deepEqual(getPortalProfile(id).features, full, id);
  }
});
