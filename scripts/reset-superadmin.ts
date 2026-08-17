/**
 * Reset the password for the bootstrap SUPER_ADMIN account(s).
 *
 * WHY THIS EXISTS
 * ---------------
 * db-init.ts seeds super admins idempotently:
 *
 *     const exists = await db('users').where({ email }).first();
 *     if (!exists) { await db('users').insert({ ...admin, password: hash }); }
 *
 * The insert only runs when the row is ABSENT. Once an account exists, changing
 * SUPERADMIN_PASSWORD in the environment has NO effect on the stored hash, so
 * the password stays whatever it was at first successful seed. That is correct
 * behaviour (a redeploy must never silently reset a live admin password), but it
 * means there has to be a deliberate way to rotate it. This is that way.
 *
 * USAGE
 *   npm run reset:superadmin -- 'NewStrongPassword123'
 *   npm run reset:superadmin -- 'NewStrongPassword123' admin@example.com
 *
 * Run it against the SAME database the app uses (set DATABASE_URL).
 */
import db from '../src/lib/db';
import bcrypt from 'bcryptjs';

/** Kept in sync with src/lib/startup-checks.ts */
const BANNED = new Set([
  'admin123',
  'password',
  'ChangeMe123!',
  'changeme',
  'admin',
  'secret',
]);

/** The accounts seeded by db-init.ts. */
const SEEDED_SUPERADMINS = ['superadmin@ecclesiagh.com', 'www.epa04@gmail.com'];

async function main() {
  const password = process.argv[2] || process.env.SUPERADMIN_PASSWORD;
  const emailArg = process.argv[3];

  if (!password) {
    console.error('ERROR: no password supplied.');
    console.error("Usage: npm run reset:superadmin -- 'YourNewPassword'");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('ERROR: password must be at least 12 characters (matches the production policy).');
    process.exit(1);
  }
  if (BANNED.has(password)) {
    console.error('ERROR: that is a well-known default password and is rejected.');
    process.exit(1);
  }

  const targets = emailArg ? [emailArg] : SEEDED_SUPERADMINS;
  const hash = await bcrypt.hash(password, 12);

  let updated = 0;
  for (const email of targets) {
    const user = await db('users').where({ email }).first();
    if (!user) {
      console.warn(`SKIP: no user found with email ${email}`);
      continue;
    }

    await db('users').where({ email }).update({
      password: hash,
      status: 'active',
      role: 'SUPER_ADMIN',
    });
    updated++;
    console.log(`OK: password reset for ${email} (uid=${user.uid})`);

    // Clear the failed-attempt history so an existing lockout does not block
    // the very next sign-in. Lockout is computed from login_logs, not from a
    // column on users, so the rows must be removed.
    const cleared = await db('login_logs')
      .where({ email, success: false })
      .del()
      .catch(() => 0);
    if (cleared) console.log(`     cleared ${cleared} failed login attempt(s) / lockout state`);
  }

  console.log(`\nDone. ${updated} account(s) updated.`);
  if (updated > 0) {
    console.log('Sign in, then change the password from the UI and enable 2FA.');
  }

  await db.destroy();
  process.exit(updated > 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Failed to reset super admin password:', err);
  await db.destroy().catch(() => {});
  process.exit(1);
});
