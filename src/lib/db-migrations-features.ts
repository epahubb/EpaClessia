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
