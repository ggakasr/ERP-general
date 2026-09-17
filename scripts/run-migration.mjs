import pg from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const connectionString = process.argv[2];
if (!connectionString) {
  console.error('Usage: node scripts/run-migration.mjs <connection-string>');
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  console.log('Connecting to Supabase PostgreSQL...');
  await client.connect();
  console.log('Connected!');

  const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '001_initial_schema.sql');
  const sql = readFileSync(sqlPath, 'utf-8');

  console.log('Running migration...');
  await client.query(sql);
  console.log('Migration completed successfully!');

  const res = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  console.log('\nCreated tables:');
  res.rows.forEach(r => console.log('  -', r.table_name));

  const sod = await client.query('SELECT role_a, role_b, conflict_type FROM sod_matrix');
  console.log('\nSoD Matrix entries:', sod.rows.length);
  sod.rows.forEach(r => console.log(`  ${r.role_a} <-> ${r.role_b} (${r.conflict_type})`));

} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
