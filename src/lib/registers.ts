/**
 * Church registers.
 *
 * A register is a dedicated book for one kind of event in a member's life:
 * conversion, baptism, transfer, marriage, birth, dedication, a change of
 * office, death. Before these existed, those facts could only be reached by
 * opening a member's record and editing fields one member at a time, which is
 * the wrong shape for the job -- a secretary sitting down after a baptismal
 * service has twenty names to enter, not one.
 *
 * The important design rule: a register does NOT store its own copy of the
 * figures. Every entry writes the same member columns and status-history rows
 * that the statistical return already counts from. So a baptism entered here
 * and a baptism entered on the member's record are the same fact, counted once.
 * The registers are a better door into the same room, never a second room.
 */

export const REGISTER_KEYS = [
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
] as const;

export type RegisterKey = (typeof REGISTER_KEYS)[number];

/** The kinds of box a register entry can present. */
export type RegisterFieldType =
  | 'member'
  | 'date'
  | 'text'
  | 'textarea'
  | 'select';

/**
 * Where a dropdown's choices come from when they belong to the church rather
 * than to us. A class list or an office list is the church's own vocabulary, so
 * it is loaded at the time of asking instead of being guessed at here.
 */
export type RegisterOptionSource = 'convert_classes' | 'offices';

export type RegisterField = {
  name: string;
  label: string;
  type: RegisterFieldType;
  required?: boolean;
  /** A date that may legitimately be in the future, such as a funeral. */
  allowFuture?: boolean;
  /** Fixed choices, for a list that is the same in every church. */
  options?: Array<{ value: string; label: string }>;
  /** Choices loaded from the church's own records. */
  optionSource?: RegisterOptionSource;
  helperText?: string;
};

export type RegisterDefinition = {
  key: RegisterKey;
  /** Singular, for buttons: "Record a water baptism". */
  label: string;
  /** Plural, for the tab and the table heading. */
  plural: string;
  description: string;
  /** The field whose date orders the register and decides the period it falls in. */
  primaryDateField: string;
  /**
   * The field naming the member the entry is filed against. Usually the member
   * the event happened to; for a birth or a dedication it is the parent, since
   * the child may have no record of their own yet.
   */
  memberField: string;
  /**
   * Plain-language list of what an entry changes. Shown to the person filing it
   * so nothing is written to a member's record invisibly.
   */
  writes: string[];
  /** The statistical figures this register feeds, by their table wording. */
  countsAs: string[];
  /** True when an entry changes the member's standing, not just a date. */
  changesStanding?: boolean;
  /**
   * The papers that can be attached to an entry. Absent means this register
   * takes no attachments. Never required: a church should be able to file the
   * fact today and find the paperwork later.
   */
  documentKinds?: Array<{ value: string; label: string }>;
  /** True for the register that also tracks a certificate through to delivery. */
  tracksCertificate?: boolean;
  fields: RegisterField[];
};

const NOTES: RegisterField = {
  name: 'notes',
  label: 'Notes',
  type: 'textarea',
};

export const REGISTER_DEFINITIONS: RegisterDefinition[] = [
  {
    key: 'converts',
    label: 'a new convert',
    plural: 'New converts class',
    description:
      'Everyone who gave their life and the class that is discipling them. The date of conversion is what the return counts, and the class is how you see who still needs to finish it.',
    primaryDateField: 'convertDate',
    memberField: 'memberId',
    writes: [
      "Sets the date of conversion on the member's record",
      'Credits the member who won them, if one is named',
      'Enrols them in the class you choose',
    ],
    countsAs: ['New converts', 'Number of souls won'],
    fields: [
      { name: 'memberId', label: 'Convert', type: 'member', required: true },
      {
        name: 'convertDate',
        label: 'Date of conversion',
        type: 'date',
        required: true,
      },
      {
        name: 'wonByMemberId',
        label: 'Won by',
        type: 'member',
        helperText:
          "The soul is counted for this member's ministry, group or department.",
      },
      {
        name: 'convertClassId',
        label: 'Class / cohort',
        type: 'select',
        optionSource: 'convert_classes',
        helperText: 'Classes are set up under Settings, so every intake is named once.',
      },
      { name: 'classStartDate', label: 'Class started', type: 'date' },
      {
        name: 'classCompletedDate',
        label: 'Class completed',
        type: 'date',
        helperText: 'Leave empty while they are still in the class.',
      },
      {
        name: 'counsellorMemberId',
        label: 'Counsellor / teacher',
        type: 'member',
        helperText: 'The member teaching the class.',
      },
      NOTES,
    ],
  },
  {
    key: 'water_baptism',
    label: 'a water baptism',
    plural: 'Water baptism',
    description:
      'The baptismal roll. One entry per candidate, so a service with thirty candidates is thirty entries against one date. Filing an entry puts the certificate into processing.',
    primaryDateField: 'waterBaptismDate',
    memberField: 'memberId',
    writes: [
      "Sets the water baptism date on the member's record",
      'Puts the baptism certificate into processing',
    ],
    countsAs: ['Water baptism'],
    tracksCertificate: true,
    documentKinds: [
      { value: 'certificate', label: 'Baptism certificate' },
      { value: 'other', label: 'Other paper' },
    ],
    fields: [
      { name: 'memberId', label: 'Candidate', type: 'member', required: true },
      {
        name: 'waterBaptismDate',
        label: 'Date of baptism',
        type: 'date',
        required: true,
      },
      { name: 'officiantName', label: 'Officiating minister', type: 'text' },
      { name: 'venue', label: 'Place', type: 'text' },
      NOTES,
    ],
  },
  {
    key: 'holy_spirit_baptism',
    label: 'a Holy Spirit baptism',
    plural: 'Holy Spirit baptism',
    description:
      'When each member received the baptism of the Holy Spirit, and the service it happened in.',
    primaryDateField: 'holySpiritBaptismDate',
    memberField: 'memberId',
    writes: ["Sets the Holy Spirit baptism date on the member's record"],
    countsAs: ['Holy Spirit baptism'],
    fields: [
      { name: 'memberId', label: 'Member', type: 'member', required: true },
      {
        name: 'holySpiritBaptismDate',
        label: 'Date received',
        type: 'date',
        required: true,
      },
      {
        name: 'occasion',
        label: 'Service / occasion',
        type: 'text',
        helperText: 'For example "Easter convention".',
      },
      { name: 'officiantName', label: 'Minister present', type: 'text' },
      NOTES,
    ],
  },
  {
    key: 'transfer_in',
    label: 'a transfer in',
    plural: 'Transfers in',
    description:
      'Members received from another congregation, and where each of them came from. The letter of transfer can be attached, but an entry is never held up waiting for it.',
    primaryDateField: 'transferInDate',
    memberField: 'memberId',
    writes: [
      "Sets the transfer-in date and the sending church on the member's record",
      'Returns the member to active standing',
    ],
    countsAs: ['Transfers in'],
    changesStanding: true,
    documentKinds: [
      { value: 'transfer_letter', label: 'Letter of transfer' },
      { value: 'other', label: 'Other paper' },
    ],
    fields: [
      { name: 'memberId', label: 'Member received', type: 'member', required: true },
      {
        name: 'transferInDate',
        label: 'Date received',
        type: 'date',
        required: true,
      },
      {
        name: 'transferredFrom',
        label: 'Transferred from',
        type: 'text',
        required: true,
        helperText: 'The congregation that released them.',
      },
      { name: 'officiantName', label: 'Received by', type: 'text' },
      NOTES,
    ],
  },
  {
    key: 'transfer_out',
    label: 'a transfer out',
    plural: 'Transfers out',
    description:
      'Members released to another congregation. An entry here takes them off the active roll, so the membership figure moves with it. The letter of transfer can be attached.',
    primaryDateField: 'transferOutDate',
    memberField: 'memberId',
    writes: [
      "Sets the transfer-out date and the receiving church on the member's record",
      'Marks the member as transferred, which removes them from the active roll',
      'Writes a status-history entry dated to the transfer',
    ],
    countsAs: ['Transfers out', 'Total membership'],
    changesStanding: true,
    documentKinds: [
      { value: 'transfer_letter', label: 'Letter of transfer' },
      { value: 'other', label: 'Other paper' },
    ],
    fields: [
      { name: 'memberId', label: 'Member released', type: 'member', required: true },
      {
        name: 'transferOutDate',
        label: 'Date released',
        type: 'date',
        required: true,
      },
      {
        name: 'transferredTo',
        label: 'Transferred to',
        type: 'text',
        required: true,
        helperText: 'The congregation receiving them.',
      },
      { name: 'officiantName', label: 'Released by', type: 'text' },
      NOTES,
    ],
  },
  {
    key: 'marriage',
    label: 'a marriage',
    plural: 'Marriages',
    description:
      'The marriage register. Where both parties are members here, the two records are linked to each other as spouses.',
    primaryDateField: 'weddingDate',
    memberField: 'memberId',
    writes: [
      'Records the marriage in the marriage register',
      'Sets the wedding date and marital status on both records',
      'Links the two members to each other as spouses, where both are members here',
    ],
    countsAs: [],
    documentKinds: [
      { value: 'certificate', label: 'Marriage certificate' },
      { value: 'other', label: 'Other paper' },
    ],
    fields: [
      { name: 'memberId', label: 'Member', type: 'member', required: true },
      {
        name: 'spouseMemberId',
        label: 'Spouse (a member here)',
        type: 'member',
        helperText: 'Choose the spouse to link the two records together.',
      },
      {
        name: 'spouseName',
        label: 'Spouse (not a member here)',
        type: 'text',
        helperText: 'Type the name instead if the spouse does not attend here.',
      },
      {
        name: 'weddingDate',
        label: 'Date of marriage',
        type: 'date',
        required: true,
      },
      {
        name: 'marriageType',
        label: 'Type',
        type: 'select',
        options: [
          { value: 'church', label: 'Church / holy matrimony' },
          { value: 'ordinance', label: 'Ordinance / registry' },
          { value: 'customary', label: 'Customary' },
          { value: 'blessing', label: 'Blessing of an existing marriage' },
          { value: 'other', label: 'Other' },
        ],
      },
      { name: 'officiantName', label: 'Officiating minister', type: 'text' },
      { name: 'venue', label: 'Place', type: 'text' },
      NOTES,
    ],
  },
  {
    key: 'birth',
    label: 'a birth',
    plural: 'Births',
    description:
      "Children born to members. The child is added to the parent's record, so a dedication later on is entered against a child the church already knows about.",
    primaryDateField: 'dateOfBirth',
    memberField: 'parentMemberId',
    writes: [
      'Records the birth in the birth register',
      "Adds the child to the parent's record",
    ],
    countsAs: [],
    documentKinds: [
      { value: 'certificate', label: 'Birth certificate' },
      { value: 'other', label: 'Other paper' },
    ],
    fields: [
      {
        name: 'parentMemberId',
        label: 'Parent (a member here)',
        type: 'member',
        required: true,
      },
      { name: 'childName', label: "Child's name", type: 'text', required: true },
      {
        name: 'dateOfBirth',
        label: 'Date of birth',
        type: 'date',
        required: true,
      },
      {
        name: 'gender',
        label: 'Sex',
        type: 'select',
        options: [
          { value: 'male', label: 'Male' },
          { value: 'female', label: 'Female' },
        ],
      },
      {
        name: 'secondParentMemberId',
        label: 'Other parent (a member here)',
        type: 'member',
      },
      { name: 'secondParentName', label: 'Other parent (not a member here)', type: 'text' },
      { name: 'placeOfBirth', label: 'Place of birth', type: 'text' },
      NOTES,
    ],
  },
  {
    key: 'child_dedication',
    label: 'a child dedication',
    plural: 'Children dedication',
    description:
      "Children presented to the Lord. A dedication is marked against the child on the parent's record, so the two registers agree about the same child.",
    primaryDateField: 'dedicationDate',
    memberField: 'parentMemberId',
    writes: [
      'Records the dedication in the dedication register',
      "Marks the child as dedicated on the parent's record, with the date",
    ],
    countsAs: [],
    documentKinds: [
      { value: 'certificate', label: 'Dedication certificate' },
      { value: 'other', label: 'Other paper' },
    ],
    fields: [
      {
        name: 'parentMemberId',
        label: 'Parent (a member here)',
        type: 'member',
        required: true,
      },
      { name: 'childName', label: "Child's name", type: 'text', required: true },
      {
        name: 'dedicationDate',
        label: 'Date of dedication',
        type: 'date',
        required: true,
      },
      { name: 'childDateOfBirth', label: "Child's date of birth", type: 'date' },
      { name: 'officiantName', label: 'Officiating minister', type: 'text' },
      { name: 'venue', label: 'Place', type: 'text' },
      NOTES,
    ],
  },
  {
    key: 'death',
    label: 'a death',
    plural: 'Deaths',
    description:
      'Members who have passed on. An entry takes them off the active roll from the date of death, so past returns keep the membership they had at the time.',
    primaryDateField: 'dateOfDeath',
    memberField: 'memberId',
    writes: [
      "Sets the date of death on the member's record",
      'Marks the member as deceased, which removes them from the active roll',
      'Writes a status-history entry dated to the death',
    ],
    countsAs: ['Deaths', 'Total membership'],
    changesStanding: true,
    documentKinds: [
      { value: 'certificate', label: 'Death certificate' },
      { value: 'burial_permit', label: 'Burial permit' },
      { value: 'obituary', label: 'Obituary / funeral programme' },
      { value: 'other', label: 'Other paper' },
    ],
    fields: [
      { name: 'memberId', label: 'Member', type: 'member', required: true },
      {
        name: 'dateOfDeath',
        label: 'Date of death',
        type: 'date',
        required: true,
      },
      { name: 'causeOfDeath', label: 'Cause', type: 'text' },
      {
        name: 'funeralDate',
        label: 'Funeral / burial',
        type: 'date',
        allowFuture: true,
        helperText: 'May be a date still to come.',
      },
      { name: 'officiantName', label: 'Officiating minister', type: 'text' },
      NOTES,
    ],
  },
  {
    key: 'promotion',
    label: 'a promotion',
    plural: 'Promotions',
    description:
      "Members raised to an office. The office they held before is taken from their record, so the register reads as a history of the office rather than a list of titles.",
    primaryDateField: 'effectiveDate',
    memberField: 'memberId',
    writes: [
      'Records the promotion in the office register',
      "Sets the new office on the member's record",
    ],
    countsAs: ['Officers', 'Other office holders'],
    documentKinds: [
      { value: 'letter', label: 'Letter of appointment' },
      { value: 'other', label: 'Other paper' },
    ],
    fields: [
      { name: 'memberId', label: 'Member', type: 'member', required: true },
      {
        name: 'toOffice',
        label: 'Promoted to',
        type: 'select',
        optionSource: 'offices',
        required: true,
        helperText: 'Offices are spelt out under Settings.',
      },
      {
        name: 'effectiveDate',
        label: 'Effective from',
        type: 'date',
        required: true,
      },
      { name: 'reason', label: 'Reason / occasion', type: 'text' },
      { name: 'approvedBy', label: 'Approved by', type: 'text' },
      NOTES,
    ],
  },
  {
    key: 'demotion',
    label: 'a demotion',
    plural: 'Demotions',
    description:
      'Members stepped down from an office, whether to a lesser office or out of office altogether. Leave the new office empty to record a member leaving office.',
    primaryDateField: 'effectiveDate',
    memberField: 'memberId',
    writes: [
      'Records the demotion in the office register',
      "Sets the new office on the member's record, or clears it if none is chosen",
    ],
    countsAs: ['Officers', 'Other office holders'],
    documentKinds: [
      { value: 'letter', label: 'Letter' },
      { value: 'other', label: 'Other paper' },
    ],
    fields: [
      { name: 'memberId', label: 'Member', type: 'member', required: true },
      {
        name: 'toOffice',
        label: 'Stepped down to',
        type: 'select',
        optionSource: 'offices',
        helperText: 'Leave empty if the member now holds no office.',
      },
      {
        name: 'effectiveDate',
        label: 'Effective from',
        type: 'date',
        required: true,
      },
      { name: 'reason', label: 'Reason', type: 'text' },
      { name: 'approvedBy', label: 'Approved by', type: 'text' },
      NOTES,
    ],
  },
];

const REGISTER_INDEX = new Map<string, RegisterDefinition>(
  REGISTER_DEFINITIONS.map((r) => [r.key, r]),
);

export function isRegisterKey(value: unknown): value is RegisterKey {
  return typeof value === 'string' && REGISTER_INDEX.has(value);
}

export function registerDefinition(key: string): RegisterDefinition | undefined {
  return REGISTER_INDEX.get(key);
}

/** Every field of a register that holds a date, for date coercion. */
export function registerDateFields(key: string): string[] {
  const def = REGISTER_INDEX.get(key);
  if (!def) return [];
  return def.fields.filter((f) => f.type === 'date').map((f) => f.name);
}

/** True when this register accepts attachments at all. */
export function acceptsDocuments(key: string): boolean {
  return (REGISTER_INDEX.get(key)?.documentKinds?.length ?? 0) > 0;
}

/**
 * Whether a kind of paper belongs to this register. Anything unrecognised is
 * filed as "other" rather than refused: the paperwork matters more than our
 * labelling of it.
 */
export function resolveDocumentKind(key: string, kind: unknown): string {
  const kinds = REGISTER_INDEX.get(key)?.documentKinds || [];
  const wanted = typeof kind === 'string' ? kind : '';
  return kinds.some((k) => k.value === wanted) ? wanted : 'other';
}

export type RegisterEntryInput = Record<string, unknown>;

export type RegisterEntryCheck = {
  ok: boolean;
  errors: string[];
};

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value);
}

/**
 * Checks one entry before anything is written to a member's record.
 *
 * A register entry changes a member's standing and moves a statistical figure,
 * so it is worth being strict here: a mistyped date of death would otherwise
 * silently rewrite last year's membership return.
 */
export function validateRegisterEntry(
  key: string,
  input: RegisterEntryInput,
  now: Date = new Date(),
): RegisterEntryCheck {
  const def = REGISTER_INDEX.get(key);
  if (!def) return { ok: false, errors: ['Unknown register.'] };

  const errors: string[] = [];
  // Compared against the end of today, so an entry filed for this morning is
  // not rejected as being in the future.
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  for (const field of def.fields) {
    const raw = input[field.name];
    const value = textOf(raw);

    if (!value) {
      if (field.required) errors.push(`${field.label} is required.`);
      continue;
    }

    if (field.type === 'date') {
      const when = new Date(value);
      if (Number.isNaN(when.getTime())) {
        errors.push(`${field.label} is not a date we can read.`);
        continue;
      }
      if (!field.allowFuture && when.getTime() > endOfToday.getTime()) {
        errors.push(`${field.label} cannot be in the future.`);
      }
    }

    // Only fixed lists can be checked here. A class or an office belongs to the
    // church, so the route checks those against the church's own records.
    if (field.type === 'select' && field.options && !field.optionSource) {
      if (!field.options.some((o) => o.value === value)) {
        errors.push(`${field.label} is not one of the choices offered.`);
      }
    }
  }

  // Register-specific rules that no single field can express on its own.
  if (key === 'marriage') {
    if (!textOf(input.spouseMemberId) && !textOf(input.spouseName)) {
      errors.push('Name the spouse, or choose them if they are a member here.');
    }
    if (
      textOf(input.spouseMemberId) &&
      textOf(input.spouseMemberId) === textOf(input.memberId)
    ) {
      errors.push('A member cannot be married to themselves.');
    }
  }

  if (key === 'converts') {
    const started = textOf(input.classStartDate);
    const finished = textOf(input.classCompletedDate);
    if (started && finished && new Date(finished) < new Date(started)) {
      errors.push('The class cannot be completed before it started.');
    }
    if (
      textOf(input.wonByMemberId) &&
      textOf(input.wonByMemberId) === textOf(input.memberId)
    ) {
      errors.push('A convert cannot be credited with winning themselves.');
    }
  }

  if (key === 'birth') {
    if (
      textOf(input.secondParentMemberId) &&
      textOf(input.secondParentMemberId) === textOf(input.parentMemberId)
    ) {
      errors.push('The two parents cannot be the same member.');
    }
  }

  if (key === 'child_dedication') {
    const born = textOf(input.childDateOfBirth);
    const dedicated = textOf(input.dedicationDate);
    if (born && dedicated && new Date(dedicated) < new Date(born)) {
      errors.push('A child cannot be dedicated before they were born.');
    }
  }

  return { ok: errors.length === 0, errors };
}

/** A document attached to an entry, as the entry carries it. */
export type RegisterDocument = {
  id: string;
  fileName: string;
  kind: string;
  kindLabel: string;
  mimeType: string;
  bytes: number;
  uploadedAt: string | null;
};

/** A filed entry, as the register table shows it. */
export type RegisterEntry = {
  id: string;
  memberId: string | null;
  memberName: string;
  /** The register's primary date, ISO. */
  date: string | null;
  /** Short line of the particulars: the sending church, the spouse, the class. */
  detail: string;
  /** Secondary particulars, shown as labelled pairs when a row is opened. */
  particulars: Array<{ label: string; value: string }>;
  /** Where the entry lives, so the row can say what it is reading. */
  origin: string;
  /**
   * Set when the name in the row is not the member the entry is filed against
   * -- a birth names the child, but the record it hangs from is the parent's.
   * The row then shows the name plainly and offers this as the link, rather
   * than pretending the child has a record of their own.
   */
  linkLabel?: string;
  notes?: string | null;
  /** How many papers are attached, so a row can show it without loading them. */
  documentCount?: number;
  /** Only on the baptism register: where the certificate has got to. */
  certificateStatus?: string | null;
};

/** Case-insensitive search across a filed register. */
export function filterRegisterEntries(
  entries: RegisterEntry[],
  query: string,
): RegisterEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries;
  return entries.filter((e) => {
    const haystack = [
      e.memberName,
      e.detail,
      e.notes || '',
      ...e.particulars.map((p) => `${p.label} ${p.value}`),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}

/** Head count per register, for the summary strip above the tabs. */
export function summarizeRegisters(
  counts: Partial<Record<RegisterKey, number>>,
): Array<{ key: RegisterKey; label: string; count: number }> {
  return REGISTER_DEFINITIONS.map((def) => ({
    key: def.key,
    label: def.plural,
    count: counts[def.key] ?? 0,
  }));
}
