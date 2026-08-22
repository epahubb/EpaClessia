/**
 * Denominations and the portal each one gets.
 *
 * A church's denomination is chosen by the superadmin at registration and
 * decides what the church admin's portal looks like. Right now every
 * denomination gets the complete portal: the tailoring for each tradition
 * hasn't been specified yet, so withholding features would remove working
 * functionality for no reason.
 *
 * When a tradition's portal is described, the only thing that needs editing is
 * that denomination's entry in PORTAL_PROFILES below - the rest of the app
 * reads its layout from here and adjusts on its own.
 */

/** Stable identifiers. These are stored in the database, so never rename them. */
export type DenominationId =
  | 'pentecostal_charismatic'
  | 'evangelical_baptist'
  | 'mainline_protestant'
  | 'orthodox_catholic'
  | 'adventist'
  | 'non_denominational';

export type Denomination = {
  id: DenominationId;
  /** Shown in the registration form and the church list. */
  label: string;
  /** One line of guidance for whoever is registering the church. */
  description: string;
};

export const DENOMINATIONS: Denomination[] = [
  {
    id: 'pentecostal_charismatic',
    label: 'Pentecostal & Charismatic',
    description: 'Pentecostal, charismatic and apostolic churches.',
  },
  {
    id: 'evangelical_baptist',
    label: 'Evangelical & Baptist',
    description: 'Evangelical, Baptist and related free churches.',
  },
  {
    id: 'mainline_protestant',
    label: 'Mainline Protestant',
    description: 'Methodist, Presbyterian, Anglican, Lutheran and similar.',
  },
  {
    id: 'orthodox_catholic',
    label: 'Orthodox and Catholic',
    description: 'Roman Catholic, Orthodox and other episcopal traditions.',
  },
  {
    id: 'adventist',
    label: 'Adventist',
    description: 'Seventh-day Adventist and other Adventist churches.',
  },
  {
    id: 'non_denominational',
    label: 'Non-Denominational',
    description: 'Independent churches not aligned to a denomination.',
  },
];

export const DENOMINATION_IDS = DENOMINATIONS.map((d) => d.id) as DenominationId[];

/**
 * Used when a church has no denomination recorded. Churches registered before
 * this field existed fall back to it, which keeps their portal unchanged.
 */
export const DEFAULT_DENOMINATION: DenominationId = 'non_denominational';

/**
 * Every area of the church admin portal that a denomination could switch off.
 * Keys match the routes and sidebar entries, so a profile can be applied
 * without a lookup table elsewhere.
 */
export type PortalFeature =
  | 'dashboard'
  | 'members'
  | 'visitors'
  | 'attendance'
  | 'engagement'
  | 'ministries'
  | 'events'
  | 'finances'
  | 'communication'
  | 'smsBundles'
  | 'users'
  | 'positions'
  | 'reports'
  | 'audit'
  | 'settings';

export const PORTAL_FEATURES: PortalFeature[] = [
  'dashboard', 'members', 'visitors', 'attendance', 'engagement', 'ministries',
  'events', 'finances', 'communication', 'smsBundles', 'users', 'positions',
  'reports', 'audit', 'settings',
];

/**
 * Optional sections of the member registration form.
 *
 * A tradition records different things about its people, so the member form is
 * assembled from the sections its denomination asks for. The core fields (name,
 * contact, membership status) are always present and are not listed here.
 */
export type MemberSection =
  /** Assigned ministries, chosen from the ministries the church has created. */
  | 'ministries'
  /** Office held in the church, chosen from the offices set up in Settings. */
  | 'office'
  /** Schools attended and certificates earned. */
  | 'education'
  /** Marital status, spouse details and children. */
  | 'family'
  /** Blood group, conditions, medication and emergency contact. */
  | 'medical';

export const MEMBER_SECTIONS: MemberSection[] = [
  'ministries', 'office', 'education', 'family', 'medical',
];

export type PortalProfile = {
  denomination: DenominationId;
  /** Denomination label, so the portal can name the tradition it is serving. */
  label: string;
  /**
   * Features the church admin can reach. A feature missing from this list is
   * hidden from the sidebar and refused by the API.
   */
  features: PortalFeature[];
  /**
   * Wording overrides for this tradition, for example calling ministries
   * "Societies" or events "Mass Schedule". Empty until each portal is described.
   */
  terminology: Partial<Record<PortalFeature, string>>;
  /**
   * Extra sections shown when registering a member. Empty means the core member
   * form, which is what every denomination gets until its portal is described.
   */
  memberSections: MemberSection[];
};

/** The complete portal - the starting point for every denomination. */
const fullPortal = (denomination: DenominationId): PortalProfile => ({
  denomination,
  label: DENOMINATIONS.find((d) => d.id === denomination)?.label || 'Church',
  features: [...PORTAL_FEATURES],
  terminology: {},
  memberSections: [],
});

/**
 * The portal for each denomination.
 *
 * All six are identical on purpose, pending the description of each one. To
 * tailor a tradition, replace its entry - for example:
 *
 *   orthodox_catholic: {
 *     ...fullPortal('orthodox_catholic'),
 *     features: PORTAL_FEATURES.filter((f) => f !== 'smsBundles'),
 *     terminology: { ministries: 'Societies & Guilds' },
 *   },
 */
export const PORTAL_PROFILES: Record<DenominationId, PortalProfile> = {
  /**
   * Pentecostal & Charismatic churches keep a fuller record of each member:
   * the ministries they serve in, the office they hold, their education, their
   * household (spouse and children, including child dedication) and medical
   * details for pastoral care and emergencies.
   */
  pentecostal_charismatic: {
    ...fullPortal('pentecostal_charismatic'),
    memberSections: [...MEMBER_SECTIONS],
  },
  evangelical_baptist: fullPortal('evangelical_baptist'),
  mainline_protestant: fullPortal('mainline_protestant'),
  orthodox_catholic: fullPortal('orthodox_catholic'),
  adventist: fullPortal('adventist'),
  non_denominational: fullPortal('non_denominational'),
};

/**
 * Accepts whatever is stored on the church record - an id, a label, or nothing
 * at all - and returns a known denomination id. Matching on the label as well
 * means a church registered by name ("Adventist") still resolves correctly.
 */
export function normalizeDenomination(value: unknown): DenominationId {
  const raw = String(value ?? '').trim();
  if (!raw) return DEFAULT_DENOMINATION;

  const byId = DENOMINATION_IDS.find((id) => id === raw.toLowerCase());
  if (byId) return byId;

  const simplified = raw.toLowerCase().replace(/[^a-z]+/g, '');
  const match = DENOMINATIONS.find(
    (d) =>
      d.label.toLowerCase().replace(/[^a-z]+/g, '') === simplified ||
      d.id.replace(/[^a-z]+/g, '') === simplified,
  );
  return match?.id || DEFAULT_DENOMINATION;
}

/** True when the value names one of the six denominations exactly. */
export function isKnownDenomination(value: unknown): boolean {
  return DENOMINATION_IDS.includes(String(value ?? '') as DenominationId);
}

/** Human-readable name for a stored denomination value. */
export function denominationLabel(value: unknown): string {
  const id = normalizeDenomination(value);
  return DENOMINATIONS.find((d) => d.id === id)?.label || 'Church';
}

/** The portal profile for a stored denomination value. */
export function getPortalProfile(value: unknown): PortalProfile {
  return PORTAL_PROFILES[normalizeDenomination(value)];
}

/** Whether a denomination's member form includes a given optional section. */
export function hasMemberSection(value: unknown, section: MemberSection): boolean {
  return getPortalProfile(value).memberSections.includes(section);
}

/** Whether a denomination's portal includes a given area. */
export function hasPortalFeature(value: unknown, feature: PortalFeature): boolean {
  return getPortalProfile(value).features.includes(feature);
}

/**
 * The label to show for a feature, honouring any wording this tradition
 * prefers and falling back to the default the portal already uses.
 */
export function featureLabel(
  value: unknown,
  feature: PortalFeature,
  fallback: string,
): string {
  return getPortalProfile(value).terminology[feature] || fallback;
}
