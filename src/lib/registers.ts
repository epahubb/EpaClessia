/**
 * Church registers.
 *
 * A register is a dedicated book for one kind of event in a member's life:
 * conversion, baptism, transfer, marriage, death. Before this existed, those
 * facts could only be reached by opening a member's record and editing the
 * milestone fields one member at a time, which is the wrong shape for the job
 * -- a secretary sitting down after a baptismal service has twenty names to
 * enter, not one.
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
  'death',
] as const;

export type RegisterKey = (typeof REGISTER_KEYS)[number];

/** The kinds of box a register entry can present. */
export type RegisterFieldType =
  | 'member'
  | 'date'
  | 'text'
  | 'textarea'
  | 'select';

export type RegisterField = {
  name: string;
  label: string;
  type: RegisterFieldType;
  required?: boolean;
  /** A date that may legitimately be in the future, such as a funeral. */
  allowFuture?: boolean;
  options?: Array<{ value: string; label: string }>;
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
   * Plain-language list of what an entry changes. Shown to the person filing it
   * so nothing is written to a member's record invisibly.
   */
  writes: string[];
  /** The statistical figures this register feeds, by their table wording. */
  countsAs: string[];
  /** True when an entry changes the member's standing, not just a date. */
  changesStanding?: boolean;
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
    writes: [
      "Sets the date of conversion on the member's record",
      'Credits the member who won them, if one is named',
      'Enrols them in the new converts class',
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
        name: 'className',
        label: 'Class / cohort',
        type: 'text',
        helperText: 'For example "Foundations, September intake".',
      },
      { name: 'classStartDate', label: 'Class started', type: 'date' },
      {
        name: 'classCompletedDate',
        label: 'Class completed',
        type: 'date',
        helperText: 'Leave empty while they are still in the class.',
      },
      { name: 'counsellorName', label: 'Counsellor / teacher', type: 'text' },
      NOTES,
    ],
  },
  {
    key: 'water_baptism',
    label: 'a water baptism',
    plural: 'Water baptism',
    description:
      'The baptismal roll. One entry per candidate, so a service with thirty candidates is thirty entries against one date.',
    primaryDateField: 'waterBaptismDate',
    writes: ["Sets the water baptism date on the member's record"],
    countsAs: ['Water baptism'],
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
      'Members received from another congregation, and where each of them came from.',
    primaryDateField: 'transferInDate',
    writes: [
      "Sets the transfer-in date and the sending church on the member's record",
      'Returns the member to active standing',
    ],
    countsAs: ['Transfers in'],
    changesStanding: true,
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
      'Members released to another congregation. An entry here takes them off the active roll, so the membership figure moves with it.',
    primaryDateField: 'transferOutDate',
    writes: [
      "Sets the transfer-out date and the receiving church on the member's record",
      'Marks the member as transferred, which removes them from the active roll',
      'Writes a status-history entry dated to the transfer',
    ],
    countsAs: ['Transfers out', 'Total membership'],
    changesStanding: true,
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
    writes: [
      'Records the marriage in the marriage register',
      'Sets the wedding date and marital status on both records',
      'Links the two members to each other as spouses, where both are members here',
    ],
    countsAs: [],
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
    key: 'death',
    label: 'a death',
    plural: 'Deaths',
    description:
      'Members who have passed on. An entry takes them off the active roll from the date of death, so past returns keep the membership they had at the time.',
    primaryDateField: 'dateOfDeath',
    writes: [
      "Sets the date of death on the member's record",
      'Marks the member as deceased, which removes them from the active roll',
      'Writes a status-history entry dated to the death',
    ],
    countsAs: ['Deaths', 'Total membership'],
    changesStanding: true,
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

/** Every field of every register that holds a date, for date coercion. */
export function registerDateFields(key: string): string[] {
  const def = REGISTER_INDEX.get(key);
  if (!def) return [];
  return def.fields.filter((f) => f.type === 'date').map((f) => f.name);
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

    if (field.type === 'select' && field.options) {
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

  return { ok: errors.length === 0, errors };
}

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
  notes?: string | null;
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
