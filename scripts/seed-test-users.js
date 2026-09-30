/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');

const envPath = path.join(__dirname, '..', '.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');
for (const line of envFile.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
  const [key, ...rest] = trimmed.split('=');
  if (process.env[key] === undefined) process.env[key] = rest.join('=');
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Test-user seeding is disabled in production.');
  }
  if (process.env.ALLOW_TEST_USER_SEED !== 'true') {
    throw new Error('Set ALLOW_TEST_USER_SEED=true to explicitly enable test-user seeding.');
  }

  const users = [
    { email: 'resident.test.konekbarangay@gmail.com', password: process.env.QA_RESIDENT_PASSWORD, displayName: 'Resident QA', role: 'resident' },
    { email: 'staff.test.konekbarangay@gmail.com', password: process.env.QA_STAFF_PASSWORD, displayName: 'Staff QA', role: 'staff' },
  ];
  if (users.some((user) => !user.password || user.password.length < 12)) {
    throw new Error('Set QA_RESIDENT_PASSWORD and QA_STAFF_PASSWORD to values at least 12 characters long.');
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  for (const user of users) {
    try {
      const created = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: { display_name: user.displayName },
      });

      const authId = created?.data?.user?.id;
      if (!authId) {
        console.log('NO_AUTH_ID', user.role);
        continue;
      }

      const result = await db.query(
        `INSERT INTO app_users (auth_user_id, role, email, display_name, is_active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (auth_user_id) DO UPDATE SET
           role = EXCLUDED.role,
           email = EXCLUDED.email,
           display_name = EXCLUDED.display_name,
           is_active = true
         RETURNING id, auth_user_id, role, email, display_name`,
        [authId, user.role, user.email, user.displayName],
      );

      console.log('CREATED', user.role, JSON.stringify(result.rows[0]));
    } catch (error) {
      console.log('CREATE_USER_ERROR', user.role, error.message);
    }
  }

  await db.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
