# KoneBarangay

Next.js application for resident profiling, barangay document requests, staff review, document issuance, and QR verification. The running application uses Supabase Auth, PostgreSQL, and Supabase Storage. The architecture document is a proposal and should not be treated as the deployed-system configuration.

## Local Setup

1. Install the dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` and fill in the Supabase project URL, publishable key, service-role key, private storage bucket name, PostgreSQL connection string, and active QR signing key ID/secret.
3. Generate a 32-byte URL-safe QR signing secret with:

	```powershell
	node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
	```

4. Create the `resident-supporting-documents` storage bucket as a **private** bucket.
5. Apply the SQL files in `src/lib/db/migrations` to the configured database in numeric order, from `0001_app_users.sql` through `0007_in_app_notifications.sql`.
The current Vitest suite covers QR token validation, resident notification/download and staff queue/revocation routes, and PostgreSQL integration tests for ownership, queue paging/search, notification ownership/read state, review/revocation audit, and revoked QR verification. Route tests mock Postgres and Supabase Storage; Supabase Auth/Storage integration and browser end-to-end tests remain future work.
6. Start the local app with `npm run dev` and open `http://localhost:3000`.

Never commit `.env.local`. The Supabase service-role key, database URL, and QR signing secret are server-only secrets; do not prefix them with `NEXT_PUBLIC_` or expose them to browser code.

## Checks

Run the local release checks before deploying:

```powershell
npm run lint
npm run typecheck
npm test
npm audit
npm run build
```

GitHub Actions runs these checks on pushes and pull requests through `.github/workflows/ci.yml`. The build step uses placeholder configuration and does not require production credentials or connect to application services.

The current Vitest suite covers QR token validation, resident-download, staff-revocation, and queue API routes, plus PostgreSQL integration tests for ownership, revocation/audit, revoked QR verification, and queue search/pagination. Route tests mock Postgres and Supabase Storage; Supabase Auth/Storage integration and browser end-to-end tests remain future work.

The PostgreSQL ownership integration test runs when `TEST_DATABASE_URL` is set to a disposable database whose name ends in `_test`. Apply the migrations to that database with `npm run test:db:migrate` before `npm test`; the migration helper refuses other database names. CI provisions its own PostgreSQL service and applies the migrations automatically.

## QA Accounts

The optional `scripts/seed-test-users.js` helper is for isolated development only. It refuses to run in production and requires `ALLOW_TEST_USER_SEED=true` plus `QA_RESIDENT_PASSWORD` and `QA_STAFF_PASSWORD` values of at least 12 characters. Keep the opt-in false and leave both QA passwords unset in production. QA accounts have fixed test email addresses and must not be used as real staff identities.

## Staff Provisioning

Use `scripts/promote-staff-user.js` to promote an existing, active, email-confirmed resident account to `staff`. The command requires `STAFF_EMAIL`, `STAFF_PROVISIONER_ACCESS_TOKEN` for an authenticated active admin, and `CONFIRM_STAFF_PROMOTION=true`. It rechecks both accounts in a transaction and writes an audit event. It cannot create admins or promote anyone to admin.

Supply the provisioner token only through a trusted, temporary secret-injection mechanism. Do not put it in `.env.local`, source control, terminal history, or logs. Public registration never grants staff or admin roles.

For the one-time first-admin bootstrap, first register and confirm the designated operator's resident account. Then run `scripts/bootstrap-first-admin.js` with `BOOTSTRAP_ADMIN_EMAIL` and `CONFIRM_FIRST_ADMIN_BOOTSTRAP` set to the same exact email, and `CONFIRM_DATABASE_HOST` set to the exact host in `DATABASE_URL`. It verifies the matching Supabase identity, refuses if any active admin already exists, and records an `admin.first_bootstrap` audit event. Since no admin exists yet, that initial audit event has a null actor. Keep these confirmation values ephemeral and use a reviewed operator procedure; do not bootstrap against production until the database host and target email have been independently checked.

## Signup Capacity

Resident signup uses Supabase Auth email confirmation. SMTP is configured in the Supabase project, not through this app's `.env` file. Supabase's built-in email sender is for development and is currently limited to 2 messages per hour; it only sends to project team addresses. Signup requests also have separate per-IP and per-user rate limits. Check the current values in Supabase because defaults can change.

Before a public registration drive:

- Configure a production SMTP provider in Supabase Auth and verify the sender domain with SPF, DKIM, and DMARC. Confirm the provider's approved hourly and burst capacity.
- Review Supabase Auth rate limits for both signup requests and emails. Increase them only within the provider's capacity and abuse controls; keep email confirmation enabled.
- For a concentrated registration event, coordinate the expected message burst with the provider and consider staggered registration or a waitlist. Add CAPTCHA protection if signup abuse is a concern.
- Exercise the flow in a separate staging project using synthetic email addresses and a provider sandbox. Monitor Supabase Auth 429 errors and provider delivery/bounce metrics before opening registration.

## Vercel Staging Setup

1. Review `git status` and the staged diff. This workspace's Git repository is `web/`. Verify `origin` points to your private staging repository before pushing reviewed project files. Confirm `.env.local` is ignored and not tracked; never push real resident data or secrets.
2. Create a dedicated Vercel project named `konekbarangay-staging` and import that repository. Use Root Directory `./`, keep the detected Next.js framework and `npm run build`, and set Node.js to 22.x to match CI. Important: Vercel always labels a new project's first deployment **Production**, even if it comes from a non-production branch. This project must therefore contain staging resources only; create a separate Vercel project for real production later.
3. Create a new Supabase project named for staging, in a region close to the Vercel deployment. Do not use or copy production data. Create the `resident-supporting-documents` Storage bucket and leave it private. Keep email confirmation enabled; use synthetic tester accounts only.
4. Apply `src/lib/db/migrations/0001_app_users.sql` through `0007_in_app_notifications.sql` in numeric order to the staging database using Supabase SQL Editor or a reviewed direct/session connection. Do not use `npm run test:db:migrate` here; that helper intentionally refuses databases without the `_test` suffix.
5. Before the first Vercel deployment, add **staging-only** values to the `Production` environment of this dedicated staging project: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `QR_SIGNING_KEY_ID`, and `QR_SIGNING_SECRET`. Set `QR_SIGNING_KEY_ID` to a staging-specific ID. Keep service-role, database, and QR secrets encrypted/server-side; only the three `NEXT_PUBLIC_` values are public. Do not set QA passwords, `ALLOW_TEST_USER_SEED=true`, or `TEST_DATABASE_URL` in Vercel.
6. Set `DATABASE_URL` to the Supabase **transaction pooler** connection string from the dashboard (port 6543), with SSL required. The app uses one `pg` connection per Vercel instance. Use a direct or session-pooler connection for reviewed migrations, not the serverless runtime URL. Generate the QR secret locally with the command in Local Setup and enter it directly into Vercel; do not paste it into chat, source files, or shell command history.
7. Start the first deployment from Vercel's Git import flow. It will be a Production deployment in the Vercel UI, but it must be the staging-only project and connect only to the staging Supabase project. After it succeeds, copy its canonical `*.vercel.app` URL into Supabase Auth's Site URL and allowlist that URL with `/register` for email confirmation redirects. Never add a real production URL or production credentials here.
8. Enable Vercel Deployment Protection for this staging project before inviting testers, if the plan supports it. Verify the staging URL, email confirmation, resident registration, private Storage, database access, QR routes, response headers, and browser workflows using synthetic data. If using branch previews, add the same staging-only values to the Preview environment and allowlist the exact preview redirect URL in Supabase Auth.
9. Keep real production in a separate Vercel project and separate Supabase project. Do not connect a production domain, enter production secrets, or migrate real records until backups, rollback, privacy/retention decisions, and Product Owner acceptance are documented and approved.

## Production Release Gate

- Configure the application runtime values from `.env.example` in the hosting platform: keep service-role, database, and QR signing values server-side, and set the three `NEXT_PUBLIC_` values as public client configuration. Leave the QA seed opt-in false and QA passwords unset.
- Confirm the production storage bucket is private and that anonymous requests cannot read issued PDFs or resident uploads.
- Apply migrations to the intended production database only after taking a recoverable backup; verify the migration result before deploying application code that depends on it.
- Confirm production staff accounts are provisioned through a trusted administrative process, not public resident registration or the QA seeding helper.
- Bootstrap the first admin once, using the confirmed account and database-host checks above; verify the audit event before using that admin to provision other staff.
- Smoke-test resident registration and sign-in, request review, issuance, resident-owned download, QR verification, and revocation using production-like accounts and data.
- Confirm backup restoration, incident contact, data-retention/privacy approval, and the rollback procedure with the barangay before launch.
- For planned QR key rotation, add the former active key ID/secret to `QR_SIGNING_PREVIOUS_KEYS` as a JSON object, then set the new active key ID and secret together. Verify old and new tokens in staging before deployment and retain prior keys until every document using them is expired, reissued, or revoked under approved policy. Do not retain a compromised key without an incident-response decision.

The architecture and sprint plan in the repository remain a design proposal. Reconcile them with this Supabase-based implementation before using them as operational or compliance documents.
