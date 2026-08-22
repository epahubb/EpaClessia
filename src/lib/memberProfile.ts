/**
 * The extended member record: ministries, education, family and medical details.
 *
 * Which of these sections a church actually sees is decided by its
 * denomination (see denominations.ts, `memberSections`). This file owns the
 * *shape* of the data and the rules for cleaning it up, and is shared by the
 * API and the browser so both agree on what a valid entry looks like.
 *
 * Education entries, children and medical details are stored as JSON text on
 * the member row. They are only ever read back with the member they belong to,
 * never searched or aggregated across members, so a JSON column is the honest
 * choice: it keeps a member's household in one place instead of scattering it
 * across side tables that must be joined and cleaned up on delete. Ministry
 * assignments are the exception - those go in the existing `ministry_members`
 * table, because a ministry leader needs to list their own members.
 */

/* ------------------------------------------------------------------ */
/* Marital status                                                     */
/* ------------------------------------------------------------------ */

export const MARITAL_STATUSES = [
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'widowed', label: 'Widowed' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'separated', label: 'Separated' },
];

/**
 * Spouse details are only meaningful for someone who is married or engaged.
 * Used by both the form (to reveal the spouse fields) and the API (to drop
 * spouse details when a member's status changes back to single).
 */
export function isPartnered(maritalStatus: unknown): boolean {
  const s = String(maritalStatus ?? '').toLowerCase();
  return s === 'married' || s === 'engaged';
}

/* ------------------------------------------------------------------ */
/* Education                                                          */
/* ------------------------------------------------------------------ */

export type EducationEntry = {
  /** e.g. "University of Ghana" */
  school: string;
  /** e.g. "BSc Nursing", "WASSCE", "Certificate in Theology" */
  certificate: string;
  /** Broad level, so reports can group by it. */
  level: string;
  fieldOfStudy: string;
  startYear: string;
  endYear: string;
  notes: string;
};

export const EDUCATION_LEVELS = [
  { value: 'basic', label: 'Basic / Primary' },
  { value: 'jhs', label: 'Junior High / Middle' },
  { value: 'shs', label: 'Senior High / Secondary' },
  { value: 'vocational', label: 'Vocational / Technical' },
  { value: 'diploma', label: 'Diploma / HND' },
  { value: 'bachelors', label: "Bachelor's Degree" },
  { value: 'masters', label: "Master's Degree" },
  { value: 'doctorate', label: 'Doctorate' },
  { value: 'professional', label: 'Professional Qualification' },
  { value: 'theological', label: 'Theological / Bible School' },
  { value: 'other', label: 'Other' },
];

/* ------------------------------------------------------------------ */
/* Children                                                           */
/* ------------------------------------------------------------------ */

export type ChildEntry = {
  name: string;
  dateOfBirth: string;
  gender: string;
  /** Child dedication - a rite this tradition records for its children. */
  dedicated: boolean;
  /** Only kept when `dedicated` is true. */
  dedicationDate: string;
  /**
   * Set when the child is themselves a member of the church, which links the
   * child's own member record to this parent.
   */
  memberId: string;
  notes: string;
};

/* ------------------------------------------------------------------ */
/* Medical                                                            */
/* ------------------------------------------------------------------ */

export type MedicalDetails = {
  bloodGroup: string;
  genotype: string;
  allergies: string;
  chronicConditions: string;
  medications: string;
  disabilities: string;
  /** Free text for anything the church should know in an emergency. */
  notes: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  healthInsuranceProvider: string;
  healthInsuranceNumber: string;
  /** Some traditions record this; kept optional and never assumed. */
  bloodTransfusionConsent: boolean;
};

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((v) => ({
  value: v,
  label: v,
}));

/* ------------------------------------------------------------------ */
/* Cleaning up what the form sends                                    */
/* ------------------------------------------------------------------ */

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const bool = (v: unknown): boolean => v === true || v === 'true' || v === 1 || v === '1';

/** Reads a JSON column that may already be parsed, be text, or be empty. */
export function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    const parsed = JSON.parse(value);
    return (parsed ?? fallback) as T;
  } catch {
    // A malformed value must not break loading the member. Better to show the
    // rest of the profile than to fail the whole request.
    return fallback;
  }
}

/**
 * Normalizes the education list. Entries with no school and no certificate are
 * dropped: a half-filled row the user abandoned should not be saved.
 */
export function normalizeEducation(value: unknown): EducationEntry[] {
  const rows = Array.isArray(value) ? value : parseJsonColumn<any[]>(value, []);
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r: any) => ({
      school: str(r?.school),
      certificate: str(r?.certificate),
      level: str(r?.level),
      fieldOfStudy: str(r?.fieldOfStudy),
      startYear: str(r?.startYear),
      endYear: str(r?.endYear),
      notes: str(r?.notes),
    }))
    .filter((r) => r.school || r.certificate);
}

/**
 * Normalizes the children list.
 *
 * A dedication date is only kept when the child is marked as dedicated, so
 * un-ticking the box cannot leave a stale date behind on the record.
 */
export function normalizeChildren(value: unknown): ChildEntry[] {
  const rows = Array.isArray(value) ? value : parseJsonColumn<any[]>(value, []);
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r: any) => {
      const dedicated = bool(r?.dedicated);
      return {
        name: str(r?.name),
        dateOfBirth: str(r?.dateOfBirth),
        gender: str(r?.gender),
        dedicated,
        dedicationDate: dedicated ? str(r?.dedicationDate) : '',
        memberId: str(r?.memberId),
        notes: str(r?.notes),
      };
    })
    .filter((r) => r.name);
}

export function normalizeMedical(value: unknown): MedicalDetails | null {
  const raw = (Array.isArray(value) ? null : parseJsonColumn<any>(value, null)) as any;
  if (!raw || typeof raw !== 'object') return null;
  const details: MedicalDetails = {
    bloodGroup: str(raw.bloodGroup),
    genotype: str(raw.genotype),
    allergies: str(raw.allergies),
    chronicConditions: str(raw.chronicConditions),
    medications: str(raw.medications),
    disabilities: str(raw.disabilities),
    notes: str(raw.notes),
    emergencyContactName: str(raw.emergencyContactName),
    emergencyContactPhone: str(raw.emergencyContactPhone),
    emergencyContactRelationship: str(raw.emergencyContactRelationship),
    healthInsuranceProvider: str(raw.healthInsuranceProvider),
    healthInsuranceNumber: str(raw.healthInsuranceNumber),
    bloodTransfusionConsent: bool(raw.bloodTransfusionConsent),
  };
  // An all-blank medical section is stored as nothing rather than a shell of
  // empty strings, so "has medical details" stays a meaningful question.
  const hasAnything = Object.entries(details).some(([, v]) =>
    typeof v === 'boolean' ? v : Boolean(v),
  );
  return hasAnything ? details : null;
}

/** Ministry ids from either an array or a comma-separated string. */
export function normalizeMinistryIds(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string' && value.trim()
      ? value.split(',')
      : [];
  const ids = raw.map((v) => str(v)).filter(Boolean);
  return Array.from(new Set(ids));
}

/** Serializes a list/object for a JSON text column, storing null when empty. */
export function toJsonColumn(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  return JSON.stringify(value);
}

/* ------------------------------------------------------------------ */
/* Spouse                                                             */
/* ------------------------------------------------------------------ */

/** Member columns holding spouse details, cleared when no longer partnered. */
export const SPOUSE_COLUMNS = [
  'spouseName',
  'spouseMemberId',
  'spousePhone',
  'spouseEmail',
  'spouseAddress',
  'spouseOccupation',
  'spouseDateOfBirth',
  'spouseDetails',
  'weddingDate',
] as const;

export type SpouseColumn = (typeof SPOUSE_COLUMNS)[number];

/** Extended member columns that are plain scalars on the member row. */
export const EXTENDED_MEMBER_COLUMNS = [
  'office',
  'isEducated',
  'hasChildren',
  ...SPOUSE_COLUMNS,
] as const;
