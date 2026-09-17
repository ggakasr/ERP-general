// Database tooling for ERP General (Supabase Postgres).
// Usage:
//   node scripts/db.mjs migrate        apply pending migrations (supabase/migrations)
//   node scripts/db.mjs seed           load demo data (supabase/seed/seed.sql)
//   node scripts/db.mjs reset          drop app objects, migrate, seed
//   node scripts/db.mjs sql "<query>"  run an ad-hoc query and print rows
//   node scripts/db.mjs file <path>    run a SQL file
//   node scripts/db.mjs functions      re-apply every CREATE OR REPLACE FUNCTION from 004/005 + grants (dev hot-patch)
// Connection string: SUPABASE_DB_URL in .env.local (never commit it).
import pg from 'pg'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv() {
  const file = join(root, '.env.local')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

loadEnv()
const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('Missing SUPABASE_DB_URL (set it in .env.local)')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
client.on('notice', (n) => console.log('  NOTICE:', n.message))

async function migrate() {
  await client.query(`CREATE TABLE IF NOT EXISTS public._migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())`)
  await client.query(`INSERT INTO public._migrations (name) VALUES ('001_initial_schema.sql') ON CONFLICT DO NOTHING`)
  const done = new Set((await client.query('SELECT name FROM public._migrations')).rows.map((r) => r.name))
  const dir = join(root, 'supabase', 'migrations')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue
    process.stdout.write(`→ ${file} ... `)
    const sql = readFileSync(join(dir, file), 'utf8')
    await client.query('BEGIN')
    try {
      await client.query(sql)
      await client.query('INSERT INTO public._migrations (name) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log('ok')
    } catch (e) {
      await client.query('ROLLBACK')
      console.log('FAILED')
      throw e
    }
  }
}

async function seed() {
  process.stdout.write('→ seed.sql ... ')
  await client.query(readFileSync(join(root, 'supabase', 'seed', 'seed.sql'), 'utf8'))
  console.log('ok')
  const { rows } = await client.query(`
    SELECT (SELECT count(*) FROM public.app_users) users, (SELECT count(*) FROM public.documents) documents,
           (SELECT count(*) FROM public.document_actions) actions, (SELECT count(*) FROM public.gl_entries) gl,
           (SELECT count(*) FROM public.stock_moves) moves, (SELECT count(*) FROM public.audit_trail) audit,
           (SELECT count(*) FILTER (WHERE result = 'BLOCKED') FROM public.sod_check_log) sod_blocked`)
  console.table(rows)
}

async function functions() {
  const dir = join(root, 'supabase', 'migrations')
  for (const file of ['004_engine.sql', '005_read_api.sql']) {
    const sql = readFileSync(join(dir, file), 'utf8')
    const blocks = sql.split(/\n(?=CREATE OR REPLACE FUNCTION )/).filter((b) => b.startsWith('CREATE OR REPLACE FUNCTION '))
    for (const b of blocks) {
      const body = b.slice(0, b.indexOf('$$;') + 3)
      await client.query(body)
    }
    console.log(`→ ${file}: ${blocks.length} functions`)
  }
  await client.query(`
    REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
    DO $$ DECLARE f record; BEGIN
      FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.proname LIKE 'api\\_%' LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
      END LOOP;
    END $$;
    NOTIFY pgrst, 'reload schema';`)
  console.log('→ grants refreshed')
}

async function reset() {
  console.log('→ dropping application objects in schema public')
  await client.query(`
    DO $$ DECLARE r record; BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
      END LOOP;
      FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.prokind = 'f' AND (p.proname LIKE 'fn\\_%' OR p.proname LIKE 'api\\_%') LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
      END LOOP;
      DROP SCHEMA IF EXISTS seed CASCADE;
    END $$;`)
  await client.query(`CREATE TABLE public._migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())`)
  await client.query(`INSERT INTO public._migrations (name) VALUES ('001_initial_schema.sql')`)
}

const [cmd, arg] = process.argv.slice(2)
try {
  await client.connect()
  if (cmd === 'migrate') await migrate()
  else if (cmd === 'seed') await seed()
  else if (cmd === 'reset') { await reset(); await migrate(); await seed() }
  else if (cmd === 'functions') await functions()
  else if (cmd === 'file') {
    await client.query(readFileSync(arg, 'utf8'))
    console.log('ok', arg)
  } else if (cmd === 'sql') {
    const res = await client.query(arg)
    const out = Array.isArray(res) ? res.map((r) => r.rows) : res.rows
    console.log(JSON.stringify(out, null, 2))
  } else {
    console.log('Commands: migrate | seed | reset | sql "<query>"')
  }
} catch (e) {
  console.error('\nERROR:', e.message)
  if (e.where) console.error('WHERE:', e.where)
  if (e.position) console.error('POSITION:', e.position)
  process.exitCode = 1
} finally {
  await client.end()
}
