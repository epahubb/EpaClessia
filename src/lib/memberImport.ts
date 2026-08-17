/**
 * Shared member-import rules.
 *
 * This module is deliberately ISOMORPHIC: no DOM, no Buffer, no database. The
 * browser uses it to preview and validate a spreadsheet before upload, and the
 * server uses the SAME functions on the submitted rows. That matters because a
 * preview that accepts a row the server later rejects (or vice versa) is worse
 * than no preview at all. Reading a spreadsheet file itself (SheetJS/xlsx)
 * happens in the browser; only plain JSON rows reach the server.
 */

export interface MemberImportField {
  key: string;
  label: string;
  required?: boolean;
  /** Header spellings seen in real church spreadsheets, all lowercased. */
  aliases: string[];
}

export const MEMBER_IMPORT_FIELDS: MemberImportField[] = [
  { key: 'firstName', label: 'First name', required: true, aliases: ['first name', 'firstname', 'first', 'given name', 'givenname'] },
  { key: 'lastName', label: 'Last name', required: true, aliases: ['last name', 'lastname', 'last', 'surname', 'family name'] },
  { key: 'email', label: 'Email', aliases: ['email', 'e-mail', 'email address', 'mail'] },
  { key: 'phone', label: 'Phone', aliases: ['phone', 'phone number', 'telephone', 'tel', 'mobile', 'mobile number', 'contact', 'msisdn'] },
  { key: 'gender', label: 'Gender', aliases: ['gender', 'sex'] },
  { key: 'dateOfBirth', label: 'Date of birth', aliases: ['date of birth', 'dob', 'birthday', 'birth date', 'birthdate'] },
  { key: 'maritalStatus', label: 'Marital status', aliases: ['marital status', 'marital', 'maritalstatus'] },
  { key: 'anniversaryDate', label: 'Anniversary', aliases: ['anniversary', 'anniversary date', 'wedding anniversary'] },
  { key: 'occupation', label: 'Occupation', aliases: ['occupation', 'job', 'profession', 'work'] },
  { key: 'address', label: 'Address', aliases: ['address', 'residence', 'location', 'home address'] },
  { key: 'membershipId', label: 'Membership ID', aliases: ['membership id', 'member id', 'membershipid', 'memberid', 'id number'] },
  { key: 'membershipStatus', label: 'Membership status', aliases: ['membership status', 'status', 'membershipstatus'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comment', 'comments', 'remarks'] },
];

export const REQUIRED_FIELDS = MEMBER_IMPORT_FIELDS.filter((f) => f.required).map((f) => f.key);

/** Upper bound per upload, so one request cannot exhaust memory or time out. */
export const MAX_IMPORT_ROWS = 2000;

/** Normalise a header cell for comparison: lowercase, collapse punctuation. */
export function normalizeHeader(header: unknown): string {
  return String(header ?? '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Guess which spreadsheet column feeds which member field.
 *
 * Exact alias matches win; only then is a loose "contains" match attempted, so
 * a sheet with both "Phone" and "Phone Type" maps "Phone" correctly. The user
 * can always correct the result in the mapping UI.
 */
export function guessColumnMapping(headers: unknown[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalized = headers.map(normalizeHeader);
  const taken = new Set<number>();

  for (const field of MEMBER_IMPORT_FIELDS) {
    let index = normalized.findIndex((h, i) => !taken.has(i) && h !== '' && field.aliases.includes(h));
    if (index === -1) {
      index = normalized.findIndex(
        (h, i) => !taken.has(i) && h !== '' && field.aliases.some((a) => h === a || h.startsWith(a + ' ')),
      );
    }
    if (index !== -1) {
      taken.add(index);
      mapping[field.key] = String(headers[index]);
    }
  }
  return mapping;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Excel stores dates as days since 1899-12-30; 25569 days precede 1970-01-01. */
const EXCEL_EPOCH_OFFSET_DAYS = 25569;
const MS_PER_DAY = 86400000;

/**
 * Parse a spreadsheet date cell into an ISO date string (YYYY-MM-DD).
 *
 * Handles the three shapes a spreadsheet actually produces: a real Date, an
 * Excel serial NUMBER (the classic silent-corruption case -- 32964 is a date,
 * not a number), and text in D/M/Y or Y-M-D form. Ambiguous text like 03/04/1990
 * is read as DAY/MONTH/YEAR, the convention in Ghana and most of the world.
 * Returns null when it cannot be understood, so the row reports an error rather
 * than storing a wrong birthday.
 */
export function parseImportDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number' && isFinite(value)) {
    // Plausible Excel serial range: 1900-01-01 (1) to about year 2200.
    if (value <= 0 || value > 120000) return null;
    const ms = (value - EXCEL_EPOCH_OFFSET_DAYS) * MS_PER_DAY;
    const date = new Date(Math.round(ms));
    return isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  if (!text) return null;

  // ISO-ish: YYYY-MM-DD or YYYY/MM/DD
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(text);
  if (iso) {
    return buildIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  // Day-first: D/M/YYYY or D-M-YY
  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/.exec(text);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    return buildIsoDate(year, Number(dmy[2]), Number(dmy[1]));
  }

  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return null;
}

function buildIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects impossible dates like 31/02, which JS would otherwise roll over.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/** Map assorted spellings onto the values the app stores. */
export function normalizeGender(value: unknown): string | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return null;
  if (['m', 'male', 'man', 'boy', 'brother'].includes(v)) return 'male';
  if (['f', 'female', 'woman', 'girl', 'sister'].includes(v)) return 'female';
  return null;
}

export function normalizeMembershipStatus(value: unknown): string {
  const v = String(value ?? '').trim().toLowerCase();
  if (['inactive', 'dormant', 'lapsed'].includes(v)) return 'inactive';
  if (['transferred', 'transfer'].includes(v)) return 'transferred';
  if (['deceased', 'late', 'dead'].includes(v)) return 'deceased';
  if (['visitor', 'guest'].includes(v)) return 'visitor';
  return 'active';
}

/**
 * Tidy a phone number without being clever about it.
 *
 * Spreadsheets frequently strip the leading zero from local numbers (Excel
 * treats them as numeric), so a 9-digit Ghanaian number gets its 0 restored.
 * Nothing is rewritten into international format: guessing a country code would
 * silently corrupt real numbers.
 */
export function normalizePhone(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  let text = String(value).trim();
  if (text.toLowerCase().startsWith('e+') || /e\+\d+$/i.test(text)) return null;
  const plus = text.startsWith('+');
  text = text.replace(/[^\d]/g, '');
  if (!text) return null;
  if (!plus && text.length === 9) text = '0' + text;
  return plus ? '+' + text : text;
}

function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text === '' ? null : text;
}

export interface NormalizedMember {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  anniversaryDate: string | null;
  maritalStatus: string | null;
  occupation: string | null;
  address: string | null;
  membershipId: string | null;
  membershipStatus: string;
  notes: string | null;
}

export interface RowResult {
  /** 1-based row number as shown in the spreadsheet, for human-readable errors. */
  rowNumber: number;
  member?: NormalizedMember;
  errors: string[];
  warnings: string[];
}

/**
 * Validate and normalise a single row.
 *
 * `row` is keyed by the ORIGINAL spreadsheet header; `mapping` says which
 * header supplies each member field.
 */
export function normalizeImportRow(
  row: Record<string, unknown>,
  mapping: Record<string, string>,
  rowNumber: number,
): RowResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const get = (key: string): unknown => {
    const header = mapping[key];
    return header === undefined ? undefined : row[header];
  };

  const firstName = cleanText(get('firstName'));
  const lastName = cleanText(get('lastName'));
  if (!firstName) errors.push('First name is required');
  if (!lastName) errors.push('Last name is required');

  const email = cleanText(get('email'));
  if (email && !EMAIL_RE.test(email)) {
    errors.push(`"${email}" is not a valid email address`);
  }

  const rawGender = cleanText(get('gender'));
  const gender = normalizeGender(rawGender);
  if (rawGender && !gender) warnings.push(`Gender "${rawGender}" was not recognised and will be left blank`);

  const rawDob = get('dateOfBirth');
  const dateOfBirth = parseImportDate(rawDob);
  if (rawDob !== undefined && rawDob !== null && rawDob !== '' && !dateOfBirth) {
    errors.push(`Date of birth "${String(rawDob)}" could not be understood`);
  }
  if (dateOfBirth && dateOfBirth > new Date().toISOString().slice(0, 10)) {
    errors.push('Date of birth is in the future');
  }

  const rawAnn = get('anniversaryDate');
  const anniversaryDate = parseImportDate(rawAnn);
  if (rawAnn !== undefined && rawAnn !== null && rawAnn !== '' && !anniversaryDate) {
    warnings.push(`Anniversary "${String(rawAnn)}" could not be understood and will be left blank`);
  }

  const phone = normalizePhone(get('phone'));
  const rawPhone = get('phone');
  if (rawPhone !== undefined && rawPhone !== null && rawPhone !== '' && !phone) {
    warnings.push('Phone number could not be read (it may have been stored as a number by Excel)');
  }

  if (errors.length > 0) return { rowNumber, errors, warnings };

  return {
    rowNumber,
    errors,
    warnings,
    member: {
      firstName: firstName as string,
      lastName: lastName as string,
      email,
      phone,
      gender,
      dateOfBirth,
      anniversaryDate,
      maritalStatus: cleanText(get('maritalStatus')),
      occupation: cleanText(get('occupation')),
      address: cleanText(get('address')),
      membershipId: cleanText(get('membershipId')),
      membershipStatus: normalizeMembershipStatus(get('membershipStatus')),
      notes: cleanText(get('notes')),
    },
  };
}

export interface ImportValidationResult {
  rows: RowResult[];
  validRows: RowResult[];
  invalidRows: RowResult[];
  /** Fatal problems that stop the whole import (bad mapping, too many rows). */
  fatalErrors: string[];
  duplicateEmails: string[];
}

/**
 * Validate an entire sheet.
 *
 * Also flags emails duplicated WITHIN the file, which is a common copy/paste
 * artefact. Those rows are reported but not rejected, since a shared family
 * email address is legitimate.
 */
export function validateImportRows(
  rows: Record<string, unknown>[],
  mapping: Record<string, string>,
): ImportValidationResult {
  const fatalErrors: string[] = [];

  for (const key of REQUIRED_FIELDS) {
    if (!mapping[key]) {
      const field = MEMBER_IMPORT_FIELDS.find((f) => f.key === key);
      fatalErrors.push(`No column has been mapped to "${field?.label || key}", which is required.`);
    }
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    fatalErrors.push('The file contains no data rows.');
  }
  if (Array.isArray(rows) && rows.length > MAX_IMPORT_ROWS) {
    fatalErrors.push(`This file has ${rows.length} rows, which exceeds the limit of ${MAX_IMPORT_ROWS} per import. Please split it.`);
  }

  if (fatalErrors.length > 0) {
    return { rows: [], validRows: [], invalidRows: [], fatalErrors, duplicateEmails: [] };
  }

  // Row 1 is the header, so the first data row is spreadsheet row 2.
  const results = rows.map((row, i) => normalizeImportRow(row, mapping, i + 2));

  const seen = new Map<string, number>();
  const duplicateEmails: string[] = [];
  for (const result of results) {
    const email = result.member?.email?.toLowerCase();
    if (!email) continue;
    if (seen.has(email)) {
      if (!duplicateEmails.includes(email)) duplicateEmails.push(email);
      result.warnings.push(`Email ${email} also appears in row ${seen.get(email)}`);
    } else {
      seen.set(email, result.rowNumber);
    }
  }

  return {
    rows: results,
    validRows: results.filter((r) => r.member),
    invalidRows: results.filter((r) => !r.member),
    fatalErrors,
    duplicateEmails,
  };
}
