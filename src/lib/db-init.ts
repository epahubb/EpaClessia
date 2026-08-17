import db from './db';
import bcrypt from 'bcryptjs';

const IS_PROD = process.env.NODE_ENV === 'production';

export async function initializeDatabase() {
  try {
    // In production we REFUSE to seed with well-known default credentials.
    // Weak seed passwords are the single most common way self-hosted apps get
    // compromised, so this fails closed.
    if (IS_PROD) {
      if (!process.env.SUPERADMIN_PASSWORD || !process.env.SEED_DEFAULT_PASSWORD) {
        throw new Error(
          'FATAL: SUPERADMIN_PASSWORD and SEED_DEFAULT_PASSWORD must be set to strong, ' +
            'unique values in production before the database is initialized.',
        );
      }
      const weak = (v: string) => v.length < 12;
      if (weak(process.env.SUPERADMIN_PASSWORD) || weak(process.env.SEED_DEFAULT_PASSWORD)) {
        throw new Error(
          'FATAL: Seed passwords must be at least 12 characters in production.',
        );
      }
    }

    // Pre-compute bcrypt password hashes for seeded accounts.
    // Override via env vars and CHANGE the defaults before a real deployment.
    const superAdminPasswordHash = await bcrypt.hash(
      process.env.SUPERADMIN_PASSWORD || 'admin123',
      12,
    );
    const seedUserPasswordHash = await bcrypt.hash(
      process.env.SEED_DEFAULT_PASSWORD || 'ChangeMe123!',
      12,
    );
    // Tenants (Churches) table
    if (!(await db.schema.hasTable('tenants'))) {
      await db.schema.createTable('tenants', (table) => {
        table.string('id').primary();
        table.string('name').notNullable();
        table.string('subdomain').nullable(); // deprecated: retained only for backward compatibility
        table.string('status').defaultTo('active'); // active, trial, suspended, deleted
        table.string('planId').defaultTo('free_trial'); // free_trial, basic, pro, enterprise
        table.string('adminEmail').notNullable();
        table.string('contactEmail');
        table.string('phone');
        table.string('timezone');
        table.string('country');
        table.string('city');
        table.string('street');
        table.text('address');
        table.string('logo');
        table.text('featureFlags'); // JSON string: { giving: true, childCheckin: true, sms: false, api: false }
        table.timestamp('trialEndDate');
        table.timestamp('createdAt').defaultTo(db.fn.now());
      });
      console.log('Table "tenants" created.');
    } else {
      // Add missing columns if they don't exist.
      // Manual check for each column (safer / portable across PostgreSQL & MySQL).
      const columns = await db('tenants').columnInfo();
      await db.schema.alterTable('tenants', (table) => {
        if (!columns.contactEmail) table.string('contactEmail');
        if (!columns.timezone) table.string('timezone');
        if (!columns.address_line1) table.string('address_line1');
        if (!columns.address_line2) table.string('address_line2');
        if (!columns.city) table.string('city');
        if (!columns.state) table.string('state');
        if (!columns.postal_code) table.string('postal_code');
        if (!columns.featureFlags) table.text('featureFlags');
        if (!columns.trialEndDate) table.timestamp('trialEndDate');
      });
    }

    // Users table
    if (!(await db.schema.hasTable('users'))) {
      await db.schema.createTable('users', (table) => {
        table.string('uid').primary();
        table.string('email').unique().notNullable();
        table.string('name').notNullable();
        table.string('phone');
        table.string('role').notNullable();
        table.string('status').defaultTo('active');
        table.string('tenantId').references('id').inTable('tenants');
        table.string('password'); // Hashed
        table.timestamp('lastLogin');
        table.timestamp('createdAt').defaultTo(db.fn.now());
      });
      console.log('Table "users" created.');
    } else {
      const userCols = await db('users').columnInfo();
      await db.schema.alterTable('users', (table) => {
        if (!userCols.phone) table.string('phone');
        if (!userCols.password) table.string('password');
        if (!userCols.name) table.string('name').notNullable().defaultTo('Unnamed User');
        if (!userCols.lastLogin) table.timestamp('lastLogin');
      });
    }

    // Support Tickets
    if (!(await db.schema.hasTable('support_tickets'))) {
      await db.schema.createTable('support_tickets', (table) => {
        table.increments('id').primary();
        table.string('ticketNumber').notNullable();
        table.string('subject').notNullable();
        table.text('message');
        table.string('category').defaultTo('Technical');
        table.string('status').defaultTo('open'); // open, in_progress, resolved, closed
        table.string('priority').defaultTo('normal'); // low, normal, high, urgent
        table.string('tenantId').references('id').inTable('tenants');
        table.string('tenantName');
        table.string('userUid').references('uid').inTable('users');
        table.string('userName');
        table.string('userEmail');
        table.string('assignedTo');
        table.timestamp('createdAt').defaultTo(db.fn.now());
        table.timestamp('updatedAt').defaultTo(db.fn.now());
      });
      console.log('Table "support_tickets" created.');
    } else {
      const ticketCols = await db('support_tickets').columnInfo();
      await db.schema.alterTable('support_tickets', (table) => {
        if (!ticketCols.ticketNumber) table.string('ticketNumber');
        if (!ticketCols.category) table.string('category').defaultTo('Technical');
        if (!ticketCols.userName) table.string('userName');
        if (!ticketCols.userEmail) table.string('userEmail');
        if (!ticketCols.assignedTo) table.string('assignedTo');
        if (!ticketCols.updatedAt) table.timestamp('updatedAt').defaultTo(db.fn.now());
      });
    }

    // Ticket Replies
    if (!(await db.schema.hasTable('ticket_replies'))) {
      await db.schema.createTable('ticket_replies', (table) => {
        table.increments('id').primary();
        table.integer('ticketId').references('id').inTable('support_tickets').onDelete('CASCADE');
        table.string('authorUid').references('uid').inTable('users');
        table.string('authorName').notNullable();
        table.string('authorRole').defaultTo('SUPER_ADMIN');
        table.text('message').notNullable();
        table.boolean('isInternalNote').defaultTo(false);
        table.timestamp('createdAt').defaultTo(db.fn.now());
      });
      console.log('Table "ticket_replies" created.');
    }

    // Invoices / Billing
    if (!(await db.schema.hasTable('invoices'))) {
      await db.schema.createTable('invoices', (table) => {
        table.string('id').primary(); // e.g. INV-2026-001
        table.string('tenantId').references('id').inTable('tenants');
        table.string('tenantName').notNullable();
        table.decimal('amount', 15, 2).notNullable();
        table.string('currency').defaultTo('GHS');
        table.string('status').defaultTo('pending'); // paid, pending, failed, overdue
        table.string('planId').defaultTo('pro');
        table.string('billingCycle').defaultTo('monthly'); // monthly, annually
        table.string('paymentMethod').defaultTo('Paystack MoMo');
        table.text('description');
        table.timestamp('issueDate').defaultTo(db.fn.now());
        table.timestamp('dueDate');
        table.timestamp('paidAt');
        table.timestamp('createdAt').defaultTo(db.fn.now());
      });
      console.log('Table "invoices" created.');
    }

    // System Settings Table
    if (!(await db.schema.hasTable('system_settings'))) {
      await db.schema.createTable('system_settings', (table) => {
        table.string('key').primary(); // e.g. 'email', 'sms', 'payment', 'storage', 'branding', 'security'
        table.text('value').notNullable(); // JSON string
        table.timestamp('updatedAt').defaultTo(db.fn.now());
      });
      console.log('Table "system_settings" created.');
    }

    // Announcements
    if (!(await db.schema.hasTable('announcements'))) {
      await db.schema.createTable('announcements', (table) => {
        table.increments('id').primary();
        table.string('subject').notNullable();
        table.text('message');
        table.string('authorUid').references('uid').inTable('users');
        table.timestamp('createdAt').defaultTo(db.fn.now());
      });
      console.log('Table "announcements" created.');
    }

    // User Tenant Roles
    if (!(await db.schema.hasTable('user_tenant_roles'))) {
      await db.schema.createTable('user_tenant_roles', (table) => {
        table.string('id').primary();
        table.string('userId').references('uid').inTable('users').onDelete('CASCADE');
        table.string('tenantId').references('id').inTable('tenants').onDelete('CASCADE');
        table.string('role').notNullable();
        table.timestamp('createdAt').defaultTo(db.fn.now());
      });
      console.log('Table "user_tenant_roles" created.');
    }

    // Audit Logs
    if (!(await db.schema.hasTable('audit_logs'))) {
      await db.schema.createTable('audit_logs', (table) => {
        table.increments('id').primary();
        table.string('adminUid').references('uid').inTable('users');
        table.string('action').notNullable();
        table.string('resource').notNullable();
        table.string('resourceId');
        table.string('ipAddress');
        table.string('userAgent');
        table.timestamp('createdAt').defaultTo(db.fn.now());
      });
      console.log('Table "audit_logs" created.');
    }

    // Donations
    if (!(await db.schema.hasTable('donations'))) {
      await db.schema.createTable('donations', (table) => {
        table.increments('id').primary();
        table.decimal('amount', 15, 2).notNullable();
        table.string('currency').defaultTo('GHS');
        table.string('tenantId').references('id').inTable('tenants');
        table.string('donorName');
        table.string('paymentMethod');
        table.string('purpose').defaultTo('General');
        table.string('memberId');
        table.string('email');
        table.string('reference');
        table.string('status').defaultTo('completed');
        table.timestamp('createdAt').defaultTo(db.fn.now());
      });
      console.log('Table "donations" created.');
    } else {
      const donationCols = await db('donations').columnInfo();
      await db.schema.alterTable('donations', (table) => {
        if (!donationCols.purpose) table.string('purpose').defaultTo('General');
        if (!donationCols.memberId) table.string('memberId');
        if (!donationCols.email) table.string('email');
        if (!donationCols.reference) table.string('reference');
      });
    }

    // Members
    if (!(await db.schema.hasTable('members'))) {
      await db.schema.createTable('members', (table) => {
        table.string('id').primary();
        table.string('tenantId').references('id').inTable('tenants');
        table.string('familyId');
        table.string('firstName').notNullable();
        table.string('lastName').notNullable();
        table.string('email');
        table.string('phone');
        table.string('gender');
        table.timestamp('dateOfBirth');
        table.string('membershipStatus').defaultTo('active'); // active, inactive, visitor
        table.timestamp('joinDate').defaultTo(db.fn.now());
        table.text('notes');
        table.timestamp('createdAt').defaultTo(db.fn.now());
        table.index(['tenantId']);
      });
      console.log('Table "members" created.');
    }

    // Families / households
    if (!(await db.schema.hasTable('families'))) {
      await db.schema.createTable('families', (table) => {
        table.string('id').primary();
        table.string('tenantId').references('id').inTable('tenants');
        table.string('name').notNullable();
        table.string('primaryContactId');
        table.text('address');
        table.string('phone');
        table.timestamp('createdAt').defaultTo(db.fn.now());
        table.index(['tenantId']);
      });
      console.log('Table "families" created.');
    }

    // Events
    if (!(await db.schema.hasTable('events'))) {
      await db.schema.createTable('events', (table) => {
        table.string('id').primary();
        table.string('tenantId').references('id').inTable('tenants');
        table.string('title').notNullable();
        table.text('description');
        table.string('location');
        table.timestamp('startTime').notNullable();
        table.timestamp('endTime');
        table.string('category').defaultTo('service'); // service, class, meeting, outreach
        table.string('createdBy');
        table.timestamp('createdAt').defaultTo(db.fn.now());
        table.index(['tenantId']);
      });
      console.log('Table "events" created.');
    }

    // Event attendance / child check-in
    if (!(await db.schema.hasTable('event_attendance'))) {
      await db.schema.createTable('event_attendance', (table) => {
        table.increments('id').primary();
        table.string('tenantId').references('id').inTable('tenants');
        table.string('eventId').notNullable();
        table.string('memberId');
        table.string('childName');
        table.string('guardianName');
        table.string('checkInCode');
        table.string('status').defaultTo('checked_in'); // checked_in, checked_out
        table.string('checkedInBy');
        table.timestamp('checkInAt').defaultTo(db.fn.now());
        table.timestamp('checkOutAt');
        table.timestamp('createdAt').defaultTo(db.fn.now());
        table.index(['tenantId', 'eventId']);
      });
      console.log('Table "event_attendance" created.');
    }

    // Communications log (SMS / email / announcements)
    if (!(await db.schema.hasTable('communications_log'))) {
      await db.schema.createTable('communications_log', (table) => {
        table.increments('id').primary();
        table.string('tenantId').references('id').inTable('tenants');
        table.string('channel').notNullable(); // sms, email, announcement
        table.string('recipient');
        table.string('subject');
        table.text('message');
        table.string('status').defaultTo('sent');
        table.string('sentBy');
        table.timestamp('createdAt').defaultTo(db.fn.now());
        table.index(['tenantId']);
      });
      console.log('Table "communications_log" created.');
    }

    // Church-level settings (per-tenant Paystack, SMS, general config)
    if (!(await db.schema.hasTable('church_settings'))) {
      await db.schema.createTable('church_settings', (table) => {
        table.increments('id').primary();
        table.string('tenantId').references('id').inTable('tenants');
        table.string('key').notNullable(); // general, paystack, sms
        table.text('value').notNullable(); // JSON string
        table.timestamp('updatedAt').defaultTo(db.fn.now());
        table.index(['tenantId', 'key']);
      });
      console.log('Table "church_settings" created.');
    }

    // Login logs (for the User & Access Control > Login Logs tab)
    if (!(await db.schema.hasTable('login_logs'))) {
      await db.schema.createTable('login_logs', (table) => {
        table.increments('id').primary();
        table.string('userId');
        table.string('userName');
        table.string('email');
        table.string('ipAddress');
        table.boolean('success').defaultTo(true);
        table.timestamp('createdAt').defaultTo(db.fn.now());
      });
      console.log('Table "login_logs" created.');
    }

    // ============ Church application modules ============
    // Visitors
    if (!(await db.schema.hasTable('visitors'))) {
      await db.schema.createTable('visitors', (t) => {
        t.string('id').primary();
        t.string('tenantId');
        t.string('firstName').notNullable();
        t.string('lastName');
        t.string('phone');
        t.string('email');
        t.string('gender');
        t.string('invitedBy');
        t.string('serviceAttended');
        t.string('howHeard');
        t.boolean('isFirstTime').defaultTo(true);
        t.integer('visitCount').defaultTo(1);
        t.string('followUpStatus').defaultTo('pending');
        t.string('convertedMemberId');
        t.text('notes');
        t.timestamp('visitDate').defaultTo(db.fn.now());
        t.timestamp('createdAt').defaultTo(db.fn.now());
        t.index(['tenantId']);
      });
      console.log('Table "visitors" created.');
    }

    // Ministries / departments / cell groups
    if (!(await db.schema.hasTable('ministries'))) {
      await db.schema.createTable('ministries', (t) => {
        t.string('id').primary();
        t.string('tenantId');
        t.string('type').defaultTo('ministry');
        t.string('name').notNullable();
        t.text('description');
        t.string('leaderId');
        t.string('leaderName');
        t.string('meetingDay');
        t.string('meetingTime');
        t.string('location');
        t.integer('memberCount').defaultTo(0);
        t.string('status').defaultTo('active');
        t.timestamp('createdAt').defaultTo(db.fn.now());
        t.index(['tenantId']);
      });
      console.log('Table "ministries" created.');
    }

    // Expenses
    if (!(await db.schema.hasTable('expenses'))) {
      await db.schema.createTable('expenses', (t) => {
        t.string('id').primary();
        t.string('tenantId');
        t.string('category').defaultTo('General');
        t.text('description');
        t.decimal('amount', 15, 2).notNullable();
        t.string('currency').defaultTo('GHS');
        t.string('paymentMethod').defaultTo('cash');
        t.string('vendor');
        t.string('status').defaultTo('approved');
        t.string('recordedBy');
        t.timestamp('date').defaultTo(db.fn.now());
        t.timestamp('createdAt').defaultTo(db.fn.now());
        t.index(['tenantId']);
      });
      console.log('Table "expenses" created.');
    }

    // Budgets
    if (!(await db.schema.hasTable('budgets'))) {
      await db.schema.createTable('budgets', (t) => {
        t.string('id').primary();
        t.string('tenantId');
        t.string('category').notNullable();
        t.string('fiscalYear');
        t.decimal('allocated', 15, 2).defaultTo(0);
        t.decimal('spent', 15, 2).defaultTo(0);
        t.text('notes');
        t.timestamp('createdAt').defaultTo(db.fn.now());
        t.index(['tenantId']);
      });
      console.log('Table "budgets" created.');
    }

    // Pledges
    if (!(await db.schema.hasTable('pledges'))) {
      await db.schema.createTable('pledges', (t) => {
        t.string('id').primary();
        t.string('tenantId');
        t.string('memberId');
        t.string('memberName');
        t.string('purpose').defaultTo('General');
        t.decimal('amountPledged', 15, 2).defaultTo(0);
        t.decimal('amountPaid', 15, 2).defaultTo(0);
        t.string('currency').defaultTo('GHS');
        t.string('status').defaultTo('active');
        t.timestamp('dueDate');
        t.timestamp('createdAt').defaultTo(db.fn.now());
        t.index(['tenantId']);
      });
      console.log('Table "pledges" created.');
    }

    // Inventory / assets
    if (!(await db.schema.hasTable('inventory'))) {
      await db.schema.createTable('inventory', (t) => {
        t.string('id').primary();
        t.string('tenantId');
        t.string('name').notNullable();
        t.string('category').defaultTo('General');
        t.integer('quantity').defaultTo(1);
        t.decimal('unitValue', 15, 2).defaultTo(0);
        t.string('condition').defaultTo('good');
        t.string('location');
        t.text('notes');
        t.timestamp('createdAt').defaultTo(db.fn.now());
        t.index(['tenantId']);
      });
      console.log('Table "inventory" created.');
    }

    // Branches
    if (!(await db.schema.hasTable('branches'))) {
      await db.schema.createTable('branches', (t) => {
        t.string('id').primary();
        t.string('tenantId');
        t.string('name').notNullable();
        t.string('location');
        t.string('pastorName');
        t.string('phone');
        t.string('email');
        t.integer('memberCount').defaultTo(0);
        t.boolean('isMain').defaultTo(false);
        t.timestamp('createdAt').defaultTo(db.fn.now());
        t.index(['tenantId']);
      });
      console.log('Table "branches" created.');
    }

    // Service schedules
    if (!(await db.schema.hasTable('service_schedules'))) {
      await db.schema.createTable('service_schedules', (t) => {
        t.string('id').primary();
        t.string('tenantId');
        t.string('name').notNullable();
        t.string('dayOfWeek');
        t.string('startTime');
        t.string('endTime');
        t.string('location');
        t.string('branchId');
        t.timestamp('createdAt').defaultTo(db.fn.now());
        t.index(['tenantId']);
      });
      console.log('Table "service_schedules" created.');
    }

    // Church activity / audit log
    if (!(await db.schema.hasTable('church_activity_log'))) {
      await db.schema.createTable('church_activity_log', (t) => {
        t.increments('id').primary();
        t.string('tenantId');
        t.string('userId');
        t.string('userName');
        t.string('action').notNullable();
        t.string('entity');
        t.string('entityId');
        t.text('details');
        t.string('ipAddress');
        t.timestamp('createdAt').defaultTo(db.fn.now());
        t.index(['tenantId']);
      });
      console.log('Table "church_activity_log" created.');
    }

    // Member column additions for richer profiles
    if (await db.schema.hasTable('members')) {
      const memberCols = await db('members').columnInfo();
      await db.schema.alterTable('members', (t) => {
        if (!memberCols.membershipId) t.string('membershipId');
        if (!memberCols.anniversaryDate) t.timestamp('anniversaryDate');
        if (!memberCols.maritalStatus) t.string('maritalStatus');
        if (!memberCols.approvalStatus) t.string('approvalStatus').defaultTo('approved');
        if (!memberCols.branchId) t.string('branchId');
        if (!memberCols.ministryId) t.string('ministryId');
        if (!memberCols.address) t.text('address');
        if (!memberCols.occupation) t.string('occupation');
        if (!memberCols.photoUrl) t.string('photoUrl');
        if (!memberCols.commPreferences) t.text('commPreferences'); // JSON channel/topic prefs
        if (!memberCols.directoryOptIn) t.boolean('directoryOptIn').defaultTo(false); // opt-in to member directory
        if (!memberCols.directoryShowPhone) t.boolean('directoryShowPhone').defaultTo(false);
        if (!memberCols.directoryShowEmail) t.boolean('directoryShowEmail').defaultTo(false);
      });
    }

    // Event registration + capacity fields (member RSVP / self check-in).
    if (await db.schema.hasTable('events')) {
      const evCols = await db('events').columnInfo();
      await db.schema.alterTable('events', (t) => {
        if (!evCols.capacity) t.integer('capacity');
        if (!evCols.requiresRegistration) t.boolean('requiresRegistration').defaultTo(false);
        if (!evCols.imageUrl) t.string('imageUrl');
        if (!evCols.ministryId) t.string('ministryId'); // ministry-scoped events
      });
    }

    // Pastoral care: prayer requests, visitations, counseling, notes.
    if (!(await db.schema.hasTable('prayer_requests'))) {
      await db.schema.createTable('prayer_requests', (t) => {
        t.string('id').primary();
        t.string('tenantId').references('id').inTable('tenants');
        t.string('requesterName');
        t.string('requesterMemberId');
        t.text('request').notNullable();
        t.string('category').defaultTo('general'); // healing, family, financial, thanksgiving, guidance, general
        t.string('status').defaultTo('open'); // open, praying, answered, closed
        t.boolean('isPrivate').defaultTo(false);
        t.string('assignedTo'); // user uid of care-team member
        t.timestamp('followUpDate');
        t.text('notes');
        t.string('createdBy');
        t.timestamp('createdAt').defaultTo(db.fn.now());
        t.timestamp('updatedAt').defaultTo(db.fn.now());
        t.index(['tenantId', 'status']);
      });
      console.log('Table "prayer_requests" created.');
    }

    if (!(await db.schema.hasTable('visitations'))) {
      await db.schema.createTable('visitations', (t) => {
        t.string('id').primary();
        t.string('tenantId').references('id').inTable('tenants');
        t.string('memberId');
        t.string('memberName');
        t.string('visitType').defaultTo('home'); // home, hospital, bereavement, prison, other
        t.string('location');
        t.timestamp('scheduledDate');
        t.timestamp('completedDate');
        t.string('status').defaultTo('scheduled'); // scheduled, completed, cancelled
        t.string('assignedTo');
        t.text('notes');
        t.string('createdBy');
        t.timestamp('createdAt').defaultTo(db.fn.now());
        t.timestamp('updatedAt').defaultTo(db.fn.now());
        t.index(['tenantId', 'status']);
      });
      console.log('Table "visitations" created.');
    }

    if (!(await db.schema.hasTable('counseling_sessions'))) {
      await db.schema.createTable('counseling_sessions', (t) => {
        t.string('id').primary();
        t.string('tenantId').references('id').inTable('tenants');
        t.string('memberId');
        t.string('memberName');
        t.string('category').defaultTo('general'); // marriage, grief, spiritual, financial, addiction, other
        t.timestamp('sessionDate');
        t.string('status').defaultTo('scheduled'); // scheduled, completed, cancelled
        t.timestamp('followUpDate');
        t.text('notes'); // confidential case notes
        t.string('counselorId');
        t.timestamp('createdAt').defaultTo(db.fn.now());
        t.timestamp('updatedAt').defaultTo(db.fn.now());
        t.index(['tenantId', 'status']);
      });
      console.log('Table "counseling_sessions" created.');
    }

    if (!(await db.schema.hasTable('pastoral_notes'))) {
      await db.schema.createTable('pastoral_notes', (t) => {
        t.string('id').primary();
        t.string('tenantId').references('id').inTable('tenants');
        t.string('memberId').notNullable();
        t.text('note').notNullable();
        t.string('createdBy');
        t.string('createdByName');
        t.timestamp('createdAt').defaultTo(db.fn.now());
        t.index(['tenantId', 'memberId']);
      });
      console.log('Table "pastoral_notes" created.');
    }

    // Ministry leader portal: tasks, roster membership, and attendance.
    if (!(await db.schema.hasTable('ministry_tasks'))) {
      await db.schema.createTable('ministry_tasks', (t) => {
        t.string('id').primary();
        t.string('tenantId').references('id').inTable('tenants');
        t.string('ministryId').notNullable();
        t.string('title').notNullable();
        t.text('description');
        t.string('assigneeId');
        t.string('assigneeName');
        t.string('status').defaultTo('todo'); // todo | in_progress | done
        t.string('priority').defaultTo('medium'); // low | medium | high
        t.timestamp('dueDate');
        t.timestamp('completedAt');
        t.string('createdBy');
        t.timestamp('createdAt').defaultTo(db.fn.now());
        t.timestamp('updatedAt').defaultTo(db.fn.now());
        t.index(['tenantId', 'ministryId']);
      });
      console.log('Table "ministry_tasks" created.');
    }

    if (!(await db.schema.hasTable('ministry_members'))) {
      await db.schema.createTable('ministry_members', (t) => {
        t.string('id').primary();
        t.string('tenantId').references('id').inTable('tenants');
        t.string('ministryId').notNullable();
        t.string('memberId');
        t.string('name').notNullable();
        t.string('role').defaultTo('member'); // member | coordinator | assistant | volunteer
        t.string('status').defaultTo('active'); // active | inactive
        t.string('phone');
        t.string('email');
        t.timestamp('joinedAt').defaultTo(db.fn.now());
        t.string('createdBy');
        t.timestamp('createdAt').defaultTo(db.fn.now());
        t.index(['tenantId', 'ministryId']);
      });
      console.log('Table "ministry_members" created.');
    }

    if (!(await db.schema.hasTable('ministry_attendance'))) {
      await db.schema.createTable('ministry_attendance', (t) => {
        t.string('id').primary();
        t.string('tenantId').references('id').inTable('tenants');
        t.string('ministryId').notNullable();
        t.string('title'); // e.g. "Sunday rehearsal"
        t.timestamp('sessionDate');
        t.integer('presentCount').defaultTo(0);
        t.integer('totalCount').defaultTo(0);
        t.text('notes');
        t.string('recordedBy');
        t.timestamp('createdAt').defaultTo(db.fn.now());
        t.index(['tenantId', 'ministryId']);
      });
      console.log('Table "ministry_attendance" created.');
    }

    // Extra tenant columns: website URL (replaces mandatory subdomain), logo, and
    // subscription expiry used by the Churches management table.
    {
      const tCols = await db('tenants').columnInfo();
      await db.schema.alterTable('tenants', (t) => {
        if (!tCols.websiteUrl) t.string('websiteUrl');
        if (!tCols.logo) t.string('logo');
        if (!tCols.subscriptionEndDate) t.timestamp('subscriptionEndDate');
        if (!tCols.smsCredits) t.integer('smsCredits').defaultTo(0);
      });
      // Subdomain is deprecated and no longer required; relax any existing
      // NOT NULL constraint so new churches can be created without one.
      if (tCols.subdomain && !tCols.subdomain.nullable) {
        try {
          await db.schema.alterTable('tenants', (t) => {
            t.string('subdomain').nullable().alter();
          });
        } catch (e) {
          console.warn('Could not relax subdomain NOT NULL constraint:', (e as Error).message);
        }
      }
    }

    // Two-factor authentication fields on users (super-admin + church admins).
    {
      const uCols = await db('users').columnInfo();
      await db.schema.alterTable('users', (t) => {
        if (!uCols.twoFactorEnabled) t.boolean('twoFactorEnabled').defaultTo(false);
        if (!uCols.twoFactorSecret) t.string('twoFactorSecret');
      });
    }

    // Custom per-user permission overrides within a church (RBAC).
    if (await db.schema.hasTable('user_tenant_roles')) {
      const rCols = await db('user_tenant_roles').columnInfo();
      await db.schema.alterTable('user_tenant_roles', (t) => {
        if (!rCols.permissions) t.text('permissions'); // JSON string array of permission codes
      });
    }

    // Subscription plans (superadmin can create plans + assign features).
    if (!(await db.schema.hasTable('subscription_plans'))) {
      await db.schema.createTable('subscription_plans', (t) => {
        t.string('id').primary();
        t.string('name').notNullable();
        t.decimal('price', 15, 2).defaultTo(0);
        t.string('billingCycle').defaultTo('monthly');
        t.integer('maxMembers').defaultTo(0);
        t.text('features'); // JSON string of feature flags / capabilities
        t.boolean('active').defaultTo(true);
        t.timestamp('createdAt').defaultTo(db.fn.now());
      });
      console.log('Table "subscription_plans" created.');
    }

    // SMS packages (bundles churches can purchase per subscription).
    if (!(await db.schema.hasTable('sms_packages'))) {
      await db.schema.createTable('sms_packages', (t) => {
        t.string('id').primary();
        t.string('name').notNullable();
        t.integer('credits').notNullable().defaultTo(0);
        t.decimal('price', 15, 2).notNullable().defaultTo(0);
        t.string('currency').defaultTo('GHS');
        t.text('description');
        t.boolean('active').defaultTo(true);
        t.timestamp('createdAt').defaultTo(db.fn.now());
      });
      console.log('Table "sms_packages" created.');
    }

    // SMS purchases (which church bought which package, and how much).
    if (!(await db.schema.hasTable('sms_purchases'))) {
      await db.schema.createTable('sms_purchases', (t) => {
        t.increments('id').primary();
        t.string('packageId').references('id').inTable('sms_packages');
        t.string('packageName');
        t.integer('credits').defaultTo(0);
        t.string('tenantId').references('id').inTable('tenants');
        t.string('tenantName');
        t.decimal('amount', 15, 2).defaultTo(0);
        t.string('currency').defaultTo('GHS');
        t.string('status').defaultTo('completed'); // completed, pending, failed
        t.string('reference');
        t.timestamp('createdAt').defaultTo(db.fn.now());
      });
      console.log('Table "sms_purchases" created.');
    }

    // Role -> permission matrix (editable by superadmin).
    if (!(await db.schema.hasTable('role_permissions'))) {
      await db.schema.createTable('role_permissions', (t) => {
        t.string('role').primary();
        t.text('permissions'); // JSON string array of permission codes
        t.timestamp('updatedAt').defaultTo(db.fn.now());
      });
      console.log('Table "role_permissions" created.');
    }

    // Seed default Super Admin users
    const superAdmins = [
      {
        uid: 'superadmin-master-id',
        email: 'superadmin@ecclesiagh.com',
        name: 'Ecclesia Master Admin',
        role: 'SUPER_ADMIN',
        status: 'active'
      },
      {
        uid: 'user-admin-id',
        email: 'www.epa04@gmail.com',
        name: 'Ecclesia Platform Admin',
        role: 'SUPER_ADMIN',
        status: 'active'
      }
    ];

    for (const admin of superAdmins) {
      const exists = await db('users').where({ email: admin.email }).first();
      if (!exists) {
        await db('users').insert({ ...admin, password: superAdminPasswordHash });
        console.log(`Seed: Super admin user ${admin.email} created.`);
      } else if (exists.role !== 'SUPER_ADMIN') {
        await db('users').where({ email: admin.email }).update({ role: 'SUPER_ADMIN' });
      }
    }

    // NOTE: No demo/sample data is seeded. The application starts with a clean database.
    // Only the SUPER_ADMIN bootstrap account(s) and default system settings below are created.

    // Seed default system settings if empty
    const settingsCount = await db('system_settings').count('key as count').first();
    if (!settingsCount || Number(settingsCount.count) === 0) {
      const defaultSettings = [
        {
          key: 'branding',
          value: JSON.stringify({
            platformName: 'Ecclesia Church Management Platform',
            supportEmail: 'support@ecclesiagh.com',
            systemPhone: '+233 30 200 1122',
            logoUrl: '',
            defaultCurrency: 'GHS',
            defaultTimezone: 'Africa/Accra'
          })
        },
        {
          key: 'email',
          value: JSON.stringify({
            host: 'smtp.sendgrid.net',
            port: '587',
            useSsl: true,
            username: 'apikey',
            password: process.env.EMAIL_PASSWORD || '',
            fromEmail: 'noreply@ecclesiagh.com',
            fromName: 'Ecclesia Notification Engine'
          })
        },
        {
          key: 'sms',
          value: JSON.stringify({
            provider: 'mNotify',
            clientId: process.env.MNOTIFY_CLIENT_ID || '',
            clientSecret: process.env.MNOTIFY_CLIENT_SECRET || '',
            senderId: 'ECCLESIA',
            defaultRatePerSms: 0.04
          })
        },
        {
          key: 'payment',
          value: JSON.stringify({
            gateway: 'Paystack',
            publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
            secretKey: process.env.PAYSTACK_SECRET_KEY || '',
            enableTestMode: true,
            webhookUrl: 'https://app.ecclesiagh.com/api/v1/webhooks/paystack',
            supportedChannels: ['mobile_money', 'card', 'bank_transfer']
          })
        },
        {
          key: 'security',
          value: JSON.stringify({
            // Hardened secure-by-default posture.
            sessionTimeoutMinutes: 60,
            maxLoginAttempts: 5,
            lockoutDurationMinutes: 15,
            require2FAForAdmins: true,
            minPasswordLength: 12,
            passwordRequireComplexity: true,
            allowPublicRegistration: false,
            forcePasswordResetOnFirstLogin: true
          })
        },
        {
          key: 'storage',
          value: JSON.stringify({
            path: '/var/uploads/ecclesia',
            maxStorageGB: 500,
            allowedFileTypes: ['jpg', 'png', 'pdf', 'xlsx', 'docx'],
            autoBackupSchedule: 'daily'
          })
        }
      ];

      for (const s of defaultSettings) {
        await db('system_settings').insert(s);
      }
      console.log('Seed: Default system settings initialized.');
    }

    // Seed default subscription plans if empty
    const plansCount = await db('subscription_plans').count('id as count').first().catch(() => ({ count: 0 }));
    if (!plansCount || Number(plansCount.count) === 0) {
      const defaultPlans = [
        { id: 'free_trial', name: 'Free Trial', price: 0, maxMembers: 100, features: { giving: true, sms: false, api: false, childCheckin: false, support: 'Community' } },
        { id: 'basic', name: 'Basic', price: 490, maxMembers: 500, features: { giving: true, sms: true, api: false, childCheckin: true, support: 'Email' } },
        { id: 'pro', name: 'Pro', price: 990, maxMembers: 2000, features: { giving: true, sms: true, api: true, childCheckin: true, support: 'Priority' } },
        { id: 'enterprise', name: 'Enterprise', price: 2490, maxMembers: 100000, features: { giving: true, sms: true, api: true, childCheckin: true, support: 'Dedicated' } },
      ];
      for (const p of defaultPlans) {
        await db('subscription_plans').insert({ id: p.id, name: p.name, price: p.price, billingCycle: 'monthly', maxMembers: p.maxMembers, features: JSON.stringify(p.features), active: true, createdAt: new Date() });
      }
      console.log('Seed: Default subscription plans initialized.');
    }

    // Seed default role -> permission matrix if empty
    const rolePermCount = await db('role_permissions').count('role as count').first().catch(() => ({ count: 0 }));
    if (!rolePermCount || Number(rolePermCount.count) === 0) {
      const ALL = ['churches.manage', 'billing.manage', 'users.manage', 'members.manage', 'events.manage', 'giving.manage', 'comms.send', 'reports.view', 'settings.manage'];
      const defaultRolePerms: Record<string, string[]> = {
        SUPER_ADMIN: ALL,
        CHURCH_ADMIN: ALL.filter((c) => !['churches.manage', 'billing.manage'].includes(c)),
        PASTOR: ['members.manage', 'events.manage', 'giving.manage', 'comms.send', 'reports.view'],
        MINISTRY_LEADER: ['members.manage', 'events.manage', 'comms.send'],
        MEMBER: [],
      };
      for (const [role, perms] of Object.entries(defaultRolePerms)) {
        await db('role_permissions').insert({ role, permissions: JSON.stringify(perms), updatedAt: new Date() });
      }
      console.log('Seed: Default role/permission matrix initialized.');
    }

    // Sermon library (audio/video messages, notes, series) surfaced to members.
    if (!(await db.schema.hasTable('sermons'))) {
      await db.schema.createTable('sermons', (t) => {
        t.string('id').primary();
        t.string('tenantId').references('id').inTable('tenants');
        t.string('title').notNullable();
        t.string('speaker');
        t.string('seriesName');
        t.text('description');
        t.string('scripture');
        t.string('videoUrl');
        t.string('audioUrl');
        t.string('notesUrl');
        t.string('thumbnailUrl');
        t.timestamp('date');
        t.integer('durationMinutes');
        t.string('tags');
        t.boolean('published').defaultTo(true);
        t.string('createdBy');
        t.timestamp('createdAt').defaultTo(db.fn.now());
        t.index(['tenantId', 'published']);
      });
      console.log('Table "sermons" created.');
    }

    // Seed default SMS packages if empty
    const smsPkgCount = await db('sms_packages').count('id as count').first().catch(() => ({ count: 0 }));
    if (!smsPkgCount || Number(smsPkgCount.count) === 0) {
      const defaultPackages = [
        { id: 'sms_starter', name: 'Starter Bundle', credits: 1000, price: 40, description: '1,000 SMS credits' },
        { id: 'sms_growth', name: 'Growth Bundle', credits: 5000, price: 180, description: '5,000 SMS credits' },
        { id: 'sms_scale', name: 'Scale Bundle', credits: 20000, price: 650, description: '20,000 SMS credits' },
      ];
      for (const p of defaultPackages) {
        await db('sms_packages').insert({ id: p.id, name: p.name, credits: p.credits, price: p.price, currency: 'GHS', description: p.description, active: true, createdAt: new Date() });
      }
      console.log('Seed: Default SMS packages initialized.');
    }

    console.log('Database initialization complete.');
  } catch (error) {
    console.error('Error initializing database:', error);
    // Fail fast: never run a production server on a half-initialized or
    // misconfigured database. In development we rethrow too so problems are
    // caught immediately rather than surfacing as confusing runtime errors.
    throw error;
  }
}
