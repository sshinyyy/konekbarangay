/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  for (const line of envFile.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (process.env[key] === undefined) process.env[key] = rest.join('=');
  }
}

async function main() {
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const confirmedEmail = process.env.CONFIRM_FIRST_ADMIN_BOOTSTRAP?.trim().toLowerCase();
  const databaseUrl = process.env.DATABASE_URL;

  if (!adminEmail || confirmedEmail !== adminEmail) {
    throw new Error('Set BOOTSTRAP_ADMIN_EMAIL and confirm the same value in CONFIRM_FIRST_ADMIN_BOOTSTRAP.');
  }
  if (!databaseUrl || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Database and Supabase admin configuration are required.');
  }

  const databaseHost = new URL(databaseUrl).hostname;
  if (process.env.CONFIRM_DATABASE_HOST !== databaseHost) {
    throw new Error('Set CONFIRM_DATABASE_HOST to the exact host in DATABASE_URL before bootstrapping.');
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const db = new Client({ connectionString: databaseUrl });
  let transactionStarted = false;

  try {
    await db.connect();
    const targetResult = await db.query(
      `SELECT id, auth_user_id, email
       FROM app_users
       WHERE lower(email) = lower($1)
         AND role = 'resident'
         AND is_active = true`,
      [adminEmail],
    );
    if (targetResult.rows.length !== 1 || !targetResult.rows[0].auth_user_id) {
      throw new Error('Target must be a single active resident with a linked auth account.');
    }
    const target = targetResult.rows[0];

    const { data: targetResultAuth, error: targetError } = await supabase.auth.admin.getUserById(
      target.auth_user_id,
    );
    const targetAuth = targetResultAuth?.user;
    if (
      targetError ||
      !targetAuth?.email_confirmed_at ||
      targetAuth.email?.toLowerCase() !== adminEmail
    ) {
      throw new Error('Target must have a confirmed Supabase account matching BOOTSTRAP_ADMIN_EMAIL.');
    }

    await db.query('BEGIN');
    transactionStarted = true;
    await db.query("SELECT pg_advisory_xact_lock(hashtext('konekbarangay:first-admin-bootstrap'))");

    const activeAdmins = await db.query(
      `SELECT id FROM app_users WHERE role = 'admin' AND is_active = true LIMIT 1`,
    );
    if (activeAdmins.rowCount > 0) {
      throw new Error('An active admin already exists; use the admin-authorized staff provisioning command.');
    }

    const currentTarget = await db.query(
      `SELECT id
       FROM app_users
       WHERE id = $1
         AND auth_user_id = $2
         AND lower(email) = lower($3)
         AND role = 'resident'
         AND is_active = true
       FOR UPDATE`,
      [target.id, target.auth_user_id, adminEmail],
    );
    if (currentTarget.rowCount !== 1) {
      throw new Error('Target eligibility changed; no role was modified.');
    }

    await db.query(
      `UPDATE app_users SET role = 'admin', updated_at = now() WHERE id = $1`,
      [target.id],
    );
    await db.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, details)
       VALUES (NULL, 'admin.first_bootstrap', 'app_user', $1, $2::jsonb)`,
      [target.id, JSON.stringify({ fromRole: 'resident', toRole: 'admin', method: 'operator_bootstrap' })],
    );
    await db.query('COMMIT');
    transactionStarted = false;
    console.log(`BOOTSTRAPPED ${adminEmail} as the first admin on ${databaseHost}.`);
  } catch (error) {
    if (transactionStarted) await db.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await db.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error.message || 'First-admin bootstrap failed.');
  process.exit(1);
});