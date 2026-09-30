/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');

  const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  if (!/_test$/i.test(databaseName)) {
    throw new Error('Refusing migrations: TEST_DATABASE_URL must target a database ending in _test.');
  }

  const migrationsPath = path.join(__dirname, '..', 'src', 'lib', 'db', 'migrations');
  const migrationFiles = fs.readdirSync(migrationsPath)
    .filter((filename) => /^\d{4}_.+\.sql$/.test(filename))
    .sort();
  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    await client.query(
      `CREATE TABLE IF NOT EXISTS test_schema_migrations (
         filename text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );

    for (const filename of migrationFiles) {
      const applied = await client.query(
        'SELECT 1 FROM test_schema_migrations WHERE filename = $1',
        [filename],
      );
      if (applied.rowCount) continue;

      await client.query('BEGIN');
      try {
        const sql = fs.readFileSync(path.join(migrationsPath, filename), 'utf8');
        await client.query(sql);
        await client.query('INSERT INTO test_schema_migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
        console.log(`APPLIED ${filename}`);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error.message || 'Test database migration failed.');
  process.exit(1);
});