#!/usr/bin/env node
/**
 * Apply pending migrations to roy-expenses-dev (remote).
 *
 * Only files absent from `_migrations` are executed. Re-running is not merely noisy:
 * 0003 reassigns every row to a placeholder owner and drops four tables after its
 * first statement fails.
 *
 * Seeding `_migrations` for an already-migrated database is a manual one-off; see
 * "Migration tracking" in docs/DEPLOYMENT.md. Doing it here would make a fresh
 * database skip 0001-0019, so the script refuses to run against a database whose
 * record it cannot trust rather than guessing which of the two it is looking at.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DB = process.env.DEV_D1_NAME ?? 'roy-expenses-dev'
const TRACKING_MIGRATION = '0020_migrations_table.sql'

/**
 * Migration stem, as recorded in `_migrations.name` (no directory, no extension).
 * @param {string} file
 * @returns {string}
 */
export function stemOf(file) {
  return file.replace(/\.sql$/, '')
}

/**
 * Which files still need applying, in order. Pure so it can be tested without a
 * database — the selection logic is the part that must not be wrong.
 * @param {string[]} files
 * @param {string[]} appliedNames
 * @returns {string[]}
 */
export function selectPendingMigrations(files, appliedNames) {
  const applied = new Set(appliedNames)
  return files.filter((f) => f.endsWith('.sql')).sort().filter((f) => !applied.has(stemOf(f)))
}

/** Leading migration number, or 0 for anything that is not a migration file. */
function numberOf(name) {
  const n = Number(name.slice(0, 4))
  return Number.isInteger(n) ? n : 0
}

/**
 * Pending files that the database must already have.
 *
 * Migrations are strictly ordered, so a database recording 0020 necessarily ran
 * 0001-0019 to get there, whatever the table says. A pending file numbered below the
 * highest recorded one is therefore a hole in the record, not a migration that is
 * genuinely missing, and applying it means handing an already-migrated database
 * 0003's four DROP TABLEs. Seed the table instead.
 *
 * Empty on a fresh database, where everything is pending and nothing is recorded.
 * @param {string[]} pending
 * @param {string[]} appliedNames
 * @returns {string[]}
 */
export function backfillsBelowHighestApplied(pending, appliedNames) {
  const highest = appliedNames.reduce((max, name) => Math.max(max, numberOf(name)), 0)
  return pending.filter((f) => numberOf(f) < highest)
}

function wrangler(args) {
  return execFileSync('npx', ['wrangler', 'd1', 'execute', DB, '--remote', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  })
}

/**
 * Whether the database already carries the schema, regardless of what `_migrations`
 * says. The only honest way to tell a fresh database from an existing one whose record
 * was never seeded, and the two need opposite treatment.
 */
function hasApplicationTables() {
  try {
    wrangler(['--command', 'SELECT 1 FROM transactions LIMIT 1'])
    return true
  } catch {
    return false
  }
}

function appliedNames() {
  try {
    const out = wrangler(['--json', '--command', 'SELECT name FROM _migrations'])
    const parsed = JSON.parse(out)
    const results = Array.isArray(parsed) ? (parsed[0]?.results ?? []) : (parsed.result?.[0]?.results ?? [])
    return results.map((r) => r.name)
  } catch {
    // No table yet: everything is pending, including the migration that creates it.
    // Correct for a fresh database; for an existing one, seed it first.
    return []
  }
}

function main() {
  const files = readdirSync(join(ROOT, 'migrations'))
  const alreadyApplied = appliedNames()
  const pending = selectPendingMigrations(files, alreadyApplied)

  // Both checks throw rather than warn: the loop below hands files straight to a live
  // database, so anything short of stopping is a warning printed above the damage.
  const backfills = backfillsBelowHighestApplied(pending, alreadyApplied)
  if (backfills.length > 0) {
    throw new Error(
      `${DB} records ${alreadyApplied.length} migration(s) but ${backfills.length} earlier ` +
        `file(s) are unrecorded, starting with ${backfills[0]}.\n` +
        `A database cannot have reached the later ones without these, so the record is ` +
        `incomplete rather than the files being pending.\n` +
        `Seed _migrations before running this again. See "Migration tracking" in ` +
        `docs/DEPLOYMENT.md; applying 0003 to a populated database drops four tables.`,
    )
  }

  if (alreadyApplied.length === 0 && files.length > 1 && hasApplicationTables()) {
    throw new Error(
      `${DB} has application tables but no _migrations rows, so it is an existing ` +
        `database with an unseeded record, not a fresh one.\n` +
        `Seed _migrations before running this again. See "Migration tracking" in ` +
        `docs/DEPLOYMENT.md; applying 0003 to a populated database drops four tables.`,
    )
  }

  if (pending.length === 0) {
    console.log(`Nothing to do — ${alreadyApplied.length} migration(s) already applied to ${DB}`)
    return
  }

  // The tracking table has to exist before anything can be recorded against it.
  const ordered = pending.includes(TRACKING_MIGRATION)
    ? [TRACKING_MIGRATION, ...pending.filter((f) => f !== TRACKING_MIGRATION)]
    : pending

  for (const file of ordered) {
    console.log(`Applying ${file}…`)
    execFileSync('npx', ['wrangler', 'd1', 'execute', DB, '--remote', `--file=migrations/${file}`], {
      cwd: ROOT,
      stdio: 'inherit',
    })
    // Separate call: a crash between applying and recording leaves the file pending,
    // which is why the CREATE-only migrations also carry IF NOT EXISTS.
    wrangler(['--command', `INSERT OR IGNORE INTO _migrations (name) VALUES ('${stemOf(file)}')`])
  }
  console.log(`Done — applied ${ordered.length} migration(s) to ${DB}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
