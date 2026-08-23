import type { Knex } from 'knex';

/**
 * Additive schema migrations for the newer product features.
 *
 * Kept apart from `db-init.ts` so the original table definitions stay readable,
 * and written defensively: every step checks for the table/column first, so the
 * whole file is safe to run on an existing production database and safe to run
 * repeatedly (it is executed on every boot).
 */

/** Adds a column only when the table exists and the column does not. */
async function addColumn(
  db: Knex,
  table: string,
  column: string,
  build: (t: Knex.AlterTableBuilder) => void,
): Promise<void> {
  if (!(await db.schema.hasTable(table))) return;
  if (await db.schema.hasColumn(table, column)) return;
  await db.schema.alterTable(table, (t) => build(t));
  console.log(`Column "${table}.${column}" added.`);
}

/**
 * The fields a user fills in when a payment did not happen in cash: mobile
 * money, bank transfer and card all need a traceable reference so the finance
 * team can reconcile the record against a statement later.
 */
async function addPaymentDetailColumns(db: Knex, table: string): Promise<void> {
  await addColumn(db, table, 'transactionId', (t) => t.string('transactionId'));
  await addColumn(db, table, 'senderName', (t) => t.string('senderName'));
  await addColumn(db, table, 'senderNumber', (t) => t.string('senderNumber'));
  await addColumn(db, table, 'mobileMoneyNetwork', (t) => t.string('mobileMoneyNetwork'));
  await addColumn(db, table, 'bankName', (t) => t.string('bankName'));
  await addColumn(db, table, 'bankAccountName', (t) => t.string('bankAccountName'));
  await addColumn(db, table, 'bankAccountNumber', (t) => t.string('bankAccountNumber'));
  await addColumn(db, table, 'bankBranch', (t) => t.string('bankBranch'));
  await addColumn(db, table, 'transferReference', (t) => t.string('transferReference'));
  await addColumn(db, table, 'cardLastFour', (t) => t.string('cardLastFour'));
  await addColumn(db, table, 'cardHolderName', (t) => t.string('cardHolderName'));
  await addColumn(db, table, 'authorizationCode', (t) => t.string('authorizationCode'));
  await addColumn(db, table, 'paymentDate', (t) => t.timestamp('paymentDate'));
  await addColumn(db, table, 'paymentNotes', (t) => t.text('paymentNotes'));
}

/** Columns recording what the platform took from a transaction. */
async function addChargeColumns(db: Knex, table: string): Promise<void> {
  await addColumn(db, table, 'chargeAmount', (t) => t.decimal('chargeAmount', 12, 2).defaultTo(0));
  await addColumn(db, table, 'netAmount', (t) => t.decimal('netAmount', 12, 2));
  await addColumn(db, table, 'chargeBearer', (t) => t.string('chargeBearer'));
}

/**
 * Columns tying a member to their portal login.
 *
 * The member portal previously matched the signed-in user to a member row by
 * email alone. That silently broke for anyone whose portal email differed from
 * the address on their member record, and for two members sharing a family
 * address. An explicit link is stored in both directions instead, and the email
 * match is kept only as a fallback for accounts created before this existed.
 */
async function addMemberPortalColumns(db: Knex): Promise<void> {
  await addColumn(db, 'users', 'memberId', (t) => t.string('memberId'));
  await addColumn(db, 'members', 'portalUserUid', (t) => t.string('portalUserUid'));
  await addColumn(db, 'members', 'portalInvitedAt', (t) => t.timestamp('portalInvitedAt'));
  // Set when the member has signed in and chosen their own password, so the
  // admin can see who is still on a temporary one.
  await addColumn(db, 'members', 'portalPasswordSetAt', (t) => t.timestamp('portalPasswordSetAt'));
  await addColumn(db, 'users', 'mustChangePassword', (t) => t.boolean('mustChangePassword'));

  // A member may sign in with a username the church chose for them, or with
  // their email address. Stored folded to lower case: usernames are matched
  // case-insensitively, so "Ama" and "ama" must not become two accounts.
  await addColumn(db, 'users', 'username', (t) => t.string('username'));

  // Email verification. The account exists but cannot sign in until either the
  // member clicks the link or the church activates it by hand.
  await addColumn(db, 'users', 'verificationToken', (t) => t.string('verificationToken'));
  await addColumn(db, 'users', 'verificationExpiresAt', (t) => t.timestamp('verificationExpiresAt'));
  await addColumn(db, 'users', 'verifiedAt', (t) => t.timestamp('verifiedAt'));
  /** 'member' when the member used the link, 'church' when an admin activated it. */
  await addColumn(db, 'users', 'verifiedBy', (t) => t.string('verifiedBy'));

  await addColumn(db, 'members', 'portalUsername', (t) => t.string('portalUsername'));
  await addColumn(db, 'members', 'portalStatus', (t) => t.string('portalStatus'));
}

/**
 * The one group a member belongs to.
 *
 * Distinct from ministries on purpose. A member may serve in several ministries
 * (choir and ushers), but belongs to exactly one group -- a cell, zone or house
 * fellowship -- which is why this is a single column on the member rather than
 * a join table. Modelling it as a join table would allow a state the church
 * says cannot exist, and every report would then have to pick a winner.
 */
async function addGroupTables(db: Knex): Promise<void> {
  if (!(await db.schema.hasTable('church_groups'))) {
    await db.schema.createTable('church_groups', (t) => {
      t.string('id').primary();
      t.string('tenantId');
      t.string('name').notNullable();
      t.text('description');
      t.string('leaderId');
      t.string('leaderName');
      t.string('meetingDay');
      t.string('meetingTime');
      t.string('location');
      t.integer('sortOrder').defaultTo(0);
      t.boolean('active').defaultTo(true);
      t.timestamp('createdAt').defaultTo(db.fn.now());
      t.index(['tenantId']);
    });
  }

  // The id is authoritative; the name is denormalised so a member list or an
  // exported register still reads correctly without a join.
  await addColumn(db, 'members', 'groupId', (t) => t.string('groupId'));
  await addColumn(db, 'members', 'groupName', (t) => t.string('groupName'));
}

/**
 * The recording points behind the statistical returns.
 *
 * Every figure on a return is counted from records kept as part of doing the
 * work -- a member's baptism date, a logged visit, a payment -- rather than from
 * a number typed onto the sheet. This migration creates the places those facts
 * live.
 *
 * The alternative, storing period totals, is less work and much worse: a typed
 * total cannot be audited, cannot be partly corrected, and cannot answer “which
 * baptisms were those?”. Counting from the records means the sheet and the
 * register can never disagree.
 */
async function addStatisticsTables(db: Knex): Promise<void> {
  /* ---- Spiritual milestones on the member record ------------------ */
  // Dates rather than flags, because the return needs to know which period each
  // milestone fell into. A boolean “baptised” could never be counted for a
  // period at all.
  await addColumn(db, 'members', 'convertDate', (t) => t.timestamp('convertDate'));
  await addColumn(db, 'members', 'waterBaptismDate', (t) => t.timestamp('waterBaptismDate'));
  await addColumn(db, 'members', 'holySpiritBaptismDate', (t) => t.timestamp('holySpiritBaptismDate'));
  await addColumn(db, 'members', 'transferInDate', (t) => t.timestamp('transferInDate'));
  await addColumn(db, 'members', 'transferredFrom', (t) => t.string('transferredFrom'));
  await addColumn(db, 'members', 'transferOutDate', (t) => t.timestamp('transferOutDate'));
  await addColumn(db, 'members', 'transferredTo', (t) => t.string('transferredTo'));
  await addColumn(db, 'members', 'dateOfDeath', (t) => t.timestamp('dateOfDeath'));
  // Who is credited with winning this convert. This is what makes “souls won”
  // countable per unit: the figure follows the member who did the winning, not
  // the unit the convert happened to join.
  await addColumn(db, 'members', 'wonByMemberId', (t) => t.string('wonByMemberId'));
  await addColumn(db, 'members', 'wonByName', (t) => t.string('wonByName'));

  /* ---- Status history --------------------------------------------- */
  // Transfers out, deaths, backsliding and restoration are all changes of
  // standing. A member record only holds their standing now, so the return
  // needs the moment it changed -- otherwise a member who died in March would
  // still be counted as a death in every later period.
  if (!(await db.schema.hasTable('member_status_history'))) {
    await db.schema.createTable('member_status_history', (t) => {
      t.string('id').primary();
      t.string('tenantId');
      t.string('memberId').notNullable();
      t.string('memberName');
      // 'membership' for the register status, 'engagement' for attendance-based
      // classification. Kept apart so a backslider is not confused with a
      // transfer.
      t.string('kind').notNullable();
      t.string('fromStatus');
      t.string('toStatus').notNullable();
      t.timestamp('changedAt').notNullable();
      t.string('changedBy');
      t.text('notes');
      // The unit the member belonged to at the time. Copied in so a return for
      // last year still reflects who was in the unit then, rather than being
      // rewritten by a later change of group.
      t.string('groupId');
      t.text('ministryIds');
      t.timestamp('createdAt').defaultTo(db.fn.now());
      t.index(['tenantId', 'memberId']);
      t.index(['tenantId', 'kind', 'toStatus']);
      t.index(['tenantId', 'changedAt']);
    });
    console.log('Table "member_status_history" created.');
  }

  /* ---- Visitation log --------------------------------------------- */
  // Visits by the presiding elder and by ministers. Logged as the pastoral
  // record it already is, and counted from there.
  if (!(await db.schema.hasTable('pastoral_visits'))) {
    await db.schema.createTable('pastoral_visits', (t) => {
      t.string('id').primary();
      t.string('tenantId');
      t.timestamp('visitDate').notNullable();
      // Who paid the visit: presiding_elder | minister | pastor | elder | other.
      // The first two are what the return counts; the rest are recorded because
      // the church wants the pastoral record regardless.
      t.string('visitorRole').notNullable();
      t.string('visitorName');
      t.string('purpose');
      t.text('notes');
      // A visit may be to a unit, to a member, or to both.
      t.string('unitType');
      t.string('unitId');
      t.string('unitName');
      t.string('memberId');
      t.string('memberName');
      t.string('recordedBy');
      t.timestamp('createdAt').defaultTo(db.fn.now());
      t.index(['tenantId', 'visitDate']);
      t.index(['tenantId', 'unitType', 'unitId']);
      t.index(['tenantId', 'visitorRole']);
    });
    console.log('Table "pastoral_visits" created.');
  }

  /* ---- Interventional support on the expense record --------------- */
  // Support given to a member is money leaving the church, so it belongs in
  // finance and is counted from there. Marking the expense and naming the
  // beneficiary is what lets the figure be attributed to a unit.
  await addColumn(db, 'expenses', 'supportType', (t) => t.string('supportType'));
  await addColumn(db, 'expenses', 'beneficiaryMemberId', (t) => t.string('beneficiaryMemberId'));
  await addColumn(db, 'expenses', 'beneficiaryName', (t) => t.string('beneficiaryName'));

  /* ---- Communion services ----------------------------------------- */
  // The Lord's Supper figure is attendance at communion services, so a service
  // needs to be identifiable as one.
  await addColumn(db, 'events', 'isCommunion', (t) => t.boolean('isCommunion').defaultTo(false));

  // Meetings held is counted from logged attendance sessions, which need to be
  // attributable to a group as well as to a ministry.
  await addColumn(db, 'ministry_attendance', 'unitType', (t) => t.string('unitType'));
}

/**
 * Columns for the extended member record used by traditions that ask for it
 * (see denominations.ts). Added for every church rather than only the ones that
 * currently show them: a superadmin can change a church's denomination at any
 * time, and a column that appears only after a denomination switch would make
 * that change fail at the worst moment.
 */
async function addExtendedMemberColumns(db: Knex): Promise<void> {
  // Office held in the church, chosen from the offices set up in Settings.
  await addColumn(db, 'members', 'office', (t) => t.string('office'));

  // Education. Entries are JSON text because they are only ever read back with
  // the member, never queried across members.
  await addColumn(db, 'members', 'isEducated', (t) => t.boolean('isEducated'));
  await addColumn(db, 'members', 'education', (t) => t.text('education'));

  // Spouse. `spouseMemberId` is set when the spouse is also a member here,
  // which is what links the two records together.
  await addColumn(db, 'members', 'spouseName', (t) => t.string('spouseName'));
  await addColumn(db, 'members', 'spouseMemberId', (t) => t.string('spouseMemberId'));
  await addColumn(db, 'members', 'spousePhone', (t) => t.string('spousePhone'));
  await addColumn(db, 'members', 'spouseEmail', (t) => t.string('spouseEmail'));
  await addColumn(db, 'members', 'spouseAddress', (t) => t.text('spouseAddress'));
  await addColumn(db, 'members', 'spouseOccupation', (t) => t.string('spouseOccupation'));
  await addColumn(db, 'members', 'spouseDateOfBirth', (t) => t.timestamp('spouseDateOfBirth'));
  await addColumn(db, 'members', 'spouseDetails', (t) => t.text('spouseDetails'));
  await addColumn(db, 'members', 'weddingDate', (t) => t.timestamp('weddingDate'));

  // A child who is also a member points back at their parent's record, so the
  // link is visible from the child's profile too, not only the parent's.
  await addColumn(db, 'members', 'parentMemberId', (t) => t.string('parentMemberId'));

  // Children, including dedication.
  await addColumn(db, 'members', 'hasChildren', (t) => t.boolean('hasChildren'));
  await addColumn(db, 'members', 'children', (t) => t.text('children'));

  // Medical details, kept in one JSON column so a church that never fills them
  // in carries no extra empty columns on every member row.
  await addColumn(db, 'members', 'medical', (t) => t.text('medical'));

  // Offices a church can assign, spelt out by the church admin in Settings.
  if (!(await db.schema.hasTable('church_offices'))) {
    await db.schema.createTable('church_offices', (t) => {
      t.string('id').primary();
      t.string('tenantId').notNullable();
      t.string('name').notNullable();
      t.text('description');
      t.integer('sortOrder').defaultTo(0);
      t.boolean('active').defaultTo(true);
      t.timestamp('createdAt').defaultTo(db.fn.now());
      t.index(['tenantId']);
    });
    console.log('Table "church_offices" created.');
  }
}

export async function applyFeatureMigrations(db: Knex): Promise<void> {
  await addExtendedMemberColumns(db);
  await addMemberPortalColumns(db);
  await addGroupTables(db);
  await addStatisticsTables(db);
  /* ---------------------------------------------------------------- */
  /* Denomination: decides which portal the church admin gets         */
  /* ---------------------------------------------------------------- */
  // Churches registered before this existed keep a null value, which resolves
  // to the default portal, so no existing church loses anything.
  await addColumn(db, 'tenants', 'denomination', (t) => t.string('denomination'));

  /* ---------------------------------------------------------------- */
  /* Events: guarantee every column the create endpoint writes exists */
  /* ---------------------------------------------------------------- */
  // Databases created by older builds of this app are missing some of these,
  // which is what produced the opaque "Failed to create event." error: the
  // insert referenced a column the table did not have.
  await addColumn(db, 'events', 'description', (t) => t.text('description'));
  await addColumn(db, 'events', 'location', (t) => t.string('location'));
  await addColumn(db, 'events', 'endTime', (t) => t.timestamp('endTime'));
  await addColumn(db, 'events', 'category', (t) => t.string('category').defaultTo('service'));
  await addColumn(db, 'events', 'createdBy', (t) => t.string('createdBy'));
  await addColumn(db, 'events', 'isRecurring', (t) => t.boolean('isRecurring').defaultTo(false));
  await addColumn(db, 'events', 'recurrenceRule', (t) => t.string('recurrenceRule'));
  await addColumn(db, 'events', 'serviceScheduleId', (t) => t.string('serviceScheduleId'));

  // Service schedules gained the same free-text extras as events.
  await addColumn(db, 'service_schedules', 'description', (t) => t.text('description'));
  await addColumn(db, 'service_schedules', 'active', (t) => t.boolean('active').defaultTo(true));

  /* ---------------------------------------------------------------- */
  /* Payment method details on money records                          */
  /* ---------------------------------------------------------------- */
  for (const table of ['donations', 'pledges', 'expenses']) {
    await addPaymentDetailColumns(db, table);
  }
  // Pledges previously had no payment method at all, so there was nothing to
  // branch the mobile-money / bank-transfer detail fields on.
  await addColumn(db, 'pledges', 'paymentMethod', (t) => t.string('paymentMethod').defaultTo('cash'));

  /* ---------------------------------------------------------------- */
  /* Transaction charges                                              */
  /* ---------------------------------------------------------------- */
  for (const table of ['donations', 'sms_purchases', 'invoices']) {
    await addChargeColumns(db, table);
  }
  // SMS bundles are billed by the platform, so record what was actually taken
  // and which gateway account collected it.
  await addColumn(db, 'sms_purchases', 'totalAmount', (t) => t.decimal('totalAmount', 12, 2));
  await addColumn(db, 'sms_purchases', 'gatewayProvider', (t) => t.string('gatewayProvider'));
  await addColumn(db, 'sms_purchases', 'purchasedBy', (t) => t.string('purchasedBy'));

  /* ---------------------------------------------------------------- */
  /* Church settings ownership                                        */
  /* ---------------------------------------------------------------- */
  // Sections provisioned centrally are stamped so the church UI can explain
  // who configured them and when.
  await addColumn(db, 'church_settings', 'managedBy', (t) => t.string('managedBy').defaultTo('church'));
  await addColumn(db, 'church_settings', 'updatedBy', (t) => t.string('updatedBy'));

  /* ---------------------------------------------------------------- */
  /* Member engagement classification                                 */
  /* ---------------------------------------------------------------- */
  await addColumn(db, 'members', 'engagementStatus', (t) => t.string('engagementStatus'));
  await addColumn(db, 'members', 'engagementReason', (t) => t.string('engagementReason'));
  await addColumn(db, 'members', 'engagementUpdatedAt', (t) => t.timestamp('engagementUpdatedAt'));
  await addColumn(db, 'members', 'lastAttendanceAt', (t) => t.timestamp('lastAttendanceAt'));
  await addColumn(db, 'members', 'attendanceCount', (t) => t.integer('attendanceCount').defaultTo(0));
  // Set by an admin to freeze a member's label (e.g. a member on a long trip
  // should not be auto-flagged as a backslider).
  await addColumn(db, 'members', 'engagementLocked', (t) => t.boolean('engagementLocked').defaultTo(false));

  /* ---------------------------------------------------------------- */
  /* Church-defined giving / finance purposes                         */
  /* ---------------------------------------------------------------- */
  if (!(await db.schema.hasTable('finance_purposes'))) {
    await db.schema.createTable('finance_purposes', (t) => {
      t.string('id').primary();
      t.string('tenantId').references('id').inTable('tenants');
      t.string('name').notNullable();
      t.string('category').defaultTo('giving'); // giving, pledge, expense
      t.text('description');
      t.boolean('active').defaultTo(true);
      t.string('createdBy');
      t.timestamp('createdAt').defaultTo(db.fn.now());
      t.index(['tenantId', 'category']);
    });
    console.log('Table "finance_purposes" created.');
  }

  /* ---------------------------------------------------------------- */
  /* Inventory categories typed by the church                         */
  /* ---------------------------------------------------------------- */
  if (!(await db.schema.hasTable('inventory_categories'))) {
    await db.schema.createTable('inventory_categories', (t) => {
      t.string('id').primary();
      t.string('tenantId').references('id').inTable('tenants');
      t.string('name').notNullable();
      t.timestamp('createdAt').defaultTo(db.fn.now());
      t.index(['tenantId']);
    });
    console.log('Table "inventory_categories" created.');
  }

  /* ---------------------------------------------------------------- */
  /* Absence follow-up questionnaires                                 */
  /* ---------------------------------------------------------------- */
  if (!(await db.schema.hasTable('absence_surveys'))) {
    await db.schema.createTable('absence_surveys', (t) => {
      t.string('id').primary();
      t.string('tenantId').references('id').inTable('tenants');
      t.string('memberId').notNullable();
      t.string('memberName');
      t.string('eventId');
      t.string('eventName');
      // Unguessable token in the questionnaire link. This is the only
      // credential a member needs, so it is indexed unique and single-purpose.
      t.string('token').notNullable().unique();
      t.string('status').defaultTo('sent'); // sent, responded, expired
      t.string('smsStatus');
      t.string('emailStatus');
      t.string('phone');
      t.string('email');
      t.string('reasonCategory');
      t.text('reason');
      t.string('needsFollowUp');
      t.integer('daysAbsent');
      t.timestamp('sentAt').defaultTo(db.fn.now());
      t.timestamp('respondedAt');
      t.timestamp('expiresAt');
      t.string('createdBy');
      t.timestamp('createdAt').defaultTo(db.fn.now());
      t.index(['tenantId', 'status']);
      t.index(['memberId']);
    });
    console.log('Table "absence_surveys" created.');
  }
}
