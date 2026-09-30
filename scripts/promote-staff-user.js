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
  if (process.env.CONFIRM_STAFF_PROMOTION !== 'true') {
    throw new Error('Set CONFIRM_STAFF_PROMOTION=true to explicitly promote this account.');
  }

  const staffEmail = process.env.STAFF_EMAIL?.trim().toLowerCase();
  const provisionerAccessToken = process.env.STAFF_PROVISIONER_ACCESS_TOKEN;
  if (!staffEmail || !provisionerAccessToken) {
    throw new Error('Set STAFF_EMAIL and STAFF_PROVISIONER_ACCESS_TOKEN for this operation.');
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  let transactionStarted = false;

  try {
    const { data: actorResult, error: actorError } = await supabase.auth.getUser(provisionerAccessToken);
    const actor = actorResult?.user;
    if (actorError || !actor?.email || !actor.email_confirmed_at) {
      throw new Error('The provisioner token must belong to a confirmed Supabase account.');
    }

    await db.connect();
    const actorResultDb = await db.query(
      `SELECT id
       FROM app_users
       WHERE auth_user_id = $1
         AND lower(email) = lower($2)
         AND role = 'admin'
         AND is_active = true`,
      [actor.id, actor.email],
    );
    if (actorResultDb.rows.length !== 1) {
      throw new Error('The provisioner must be a single active admin account.');
    }
    const actorUserId = actorResultDb.rows[0].id;

    const targetResult = await db.query(
      `SELECT id, auth_user_id, email
       FROM app_users
       WHERE lower(email) = lower($1)
         AND role = 'resident'
         AND is_active = true`,
      [staffEmail],
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
      targetAuth.email?.toLowerCase() !== staffEmail
    ) {
      throw new Error('Target must have a confirmed Supabase account matching STAFF_EMAIL.');
    }

    await db.query('BEGIN');
    transactionStarted = true;
    const currentActor = await db.query(
      `SELECT id
       FROM app_users
       WHERE id = $1 AND role = 'admin' AND is_active = true
       FOR SHARE`,
      [actorUserId],
    );
    const currentTarget = await db.query(
      `SELECT id
       FROM app_users
       WHERE id = $1
         AND auth_user_id = $2
         AND lower(email) = lower($3)
         AND role = 'resident'
         AND is_active = true
       FOR UPDATE`,
      [target.id, target.auth_user_id, staffEmail],
    );
    if (currentActor.rowCount !== 1 || currentTarget.rowCount !== 1) {
      throw new Error('Provisioning eligibility changed; no role was modified.');
    }

    await db.query(
      `UPDATE app_users SET role = 'staff', updated_at = now() WHERE id = $1`,
      [target.id],
    );
    await db.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'user.role.promoted', 'app_user', $2, $3::jsonb)`,
      [actorUserId, target.id, JSON.stringify({ fromRole: 'resident', toRole: 'staff' })],
    );
    await db.query('COMMIT');
    transactionStarted = false;
    console.log(`PROMOTED ${staffEmail} to staff.`);
  } catch (error) {
    if (transactionStarted) await db.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await db.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error.message || 'Staff promotion failed.');
  process.exit(1);
});