#!/usr/bin/env node
/**
 * Check a D1 database against migrations/, or apply what it is missing.
 *
 *   node scripts/migrate.mjs <database>           what is pending; writes nothing
 *   node scripts/migrate.mjs <database> --apply   apply the pending files, recording each
 *
 * Exit codes: 0 up to date, 1 migrations pending, 2 the record cannot be trusted, the
 * database could not be read, or the arguments are wrong. A caller that must not ship code
 * ahead of its schema can run the check and stop on anything but 0.
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

/**
 * Where a database stands against the migration files.
 *
 * `untrusted` is returned rather than thrown because a caller deciding whether to ship
 * needs to tell it from `pending`: both are "not up to date", and only one of them can
 * be fixed by applying files.
 * @param {{
 *   database: string,
 *   files: string[],
 *   applied: string[],
 *   hasApplicationTables: () => boolean,
 * }} input `hasApplicationTables` is only asked when nothing is recorded.
 * @returns {{ state: 'current' | 'pending' | 'untrusted', pending: string[], problem?: string }}
 */
export function assess({ database, files, applied, hasApplicationTables }) {
  const pending = selectPendingMigrations(files, applied)
  const backfills = backfillsBelowHighestApplied(pending, applied)
  if (backfills.length > 0) {
    return {
      state: 'untrusted',
      pending,
      problem:
        `${database} records ${applied.length} migration(s) but ${backfills.length} earlier ` +
        `file(s) are unrecorded, starting with ${backfills[0]}.\n` +
        `A database cannot have reached the later ones without these, so the record is ` +
        `incomplete rather than the files being pending.\n` +
        `Seed _migrations before running this again. See "Migration tracking" in ` +
        `docs/DEPLOYMENT.md; applying 0003 to a populated database drops four tables.`,
    }
  }
  if (applied.length === 0 && files.filter((f) => f.endsWith('.sql')).length > 1 && hasApplicationTables()) {
    return {
      state: 'untrusted',
      pending,
      problem:
        `${database} has application tables but no _migrations rows, so it is an existing ` +
        `database with an unseeded record, not a fresh one.\n` +
        `Seed _migrations before running this again. See "Migration tracking" in ` +
        `docs/DEPLOYMENT.md; applying 0003 to a populated database drops four tables.`,
    }
  }
  return { state: pending.length === 0 ? 'current' : 'pending', pending }
}

/**
 * `<database>` and `--apply`, nothing else. Throws a usage message otherwise, so a
 * misspelt flag cannot quietly turn an `--apply` into a read-only run, or the reverse.
 * @param {string[]} argv
 * @returns {{ database: string, apply: boolean }}
 */
export function parseArgs(argv) {
  const flags = argv.filter((a) => a.startsWith('--'))
  const names = argv.filter((a) => !a.startsWith('--'))
  if (names.length !== 1 || flags.some((f) => f !== '--apply')) {
    throw new Error('Usage: node scripts/migrate.mjs <database> [--apply]')
  }
  return { database: names[0], apply: flags.includes('--apply') }
}

/**
 * Whether wrangler failed because a table does not exist, as opposed to failing to reach
 * the database. D1 reports it as `no such table`, in the JSON on stdout, not in the error
 * message. Only the first means "this database has no record yet"; treating any failure
 * that way would read a network blip as a brand-new database.
 * @param {unknown} error
 * @returns {boolean}
 */
export function isMissingTable(error) {
  const { stdout, stderr, message } = /** @type {Record<string, unknown>} */ (error ?? {})
  return /no such table/i.test([stdout, stderr, message].map(String).join('\n'))
}

function wrangler(database, args) {
  return execFileSync('npx', ['wrangler', 'd1', 'execute', database, '--remote', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  })
}

/**
 * Whether the database already carries the schema, regardless of what `_migrations`
 * says. The only honest way to tell a fresh database from an existing one whose record
 * was never seeded, and the two need opposite treatment.
 */
function hasApplicationTables(database) {
  try {
    wrangler(database, ['--command', 'SELECT 1 FROM transactions LIMIT 1'])
    return true
  } catch (error) {
    if (isMissingTable(error)) return false
    throw error
  }
}

function appliedNames(database) {
  try {
    const out = wrangler(database, ['--json', '--command', 'SELECT name FROM _migrations'])
    const parsed = JSON.parse(out)
    const results = Array.isArray(parsed) ? (parsed[0]?.results ?? []) : (parsed.result?.[0]?.results ?? [])
    return results.map((r) => r.name)
  } catch (error) {
    // No table yet: everything is pending, including the migration that creates it.
    // Correct for a fresh database; for an existing one, seed it first.
    if (isMissingTable(error)) return []
    throw error
  }
}

function applyPending(database, pending) {
  // The tracking table has to exist before anything can be recorded against it.
  const ordered = pending.includes(TRACKING_MIGRATION)
    ? [TRACKING_MIGRATION, ...pending.filter((f) => f !== TRACKING_MIGRATION)]
    : pending

  for (const file of ordered) {
    console.log(`Applying ${file}…`)
    execFileSync('npx', ['wrangler', 'd1', 'execute', database, '--remote', `--file=migrations/${file}`], {
      cwd: ROOT,
      stdio: 'inherit',
    })
    // Separate call: a crash between applying and recording leaves the file pending,
    // which is why the CREATE-only migrations also carry IF NOT EXISTS.
    wrangler(database, ['--command', `INSERT OR IGNORE INTO _migrations (name) VALUES ('${stemOf(file)}')`])
  }
  console.log(`Done — applied ${ordered.length} migration(s) to ${database}`)
}

/** @returns {number} the process exit code */
function main(argv) {
  let args
  try {
    args = parseArgs(argv)
  } catch (error) {
    console.error(error.message)
    return 2
  }
  const { database, apply } = args

  let result
  let applied
  try {
    applied = appliedNames(database)
    result = assess({
      database,
      files: readdirSync(join(ROOT, 'migrations')),
      applied,
      hasApplicationTables: () => hasApplicationTables(database),
    })
  } catch (error) {
    console.error(`Could not read ${database}: ${error.stderr || error.stdout || error.message}`)
    return 2
  }

  // Refusals are errors, not warnings: --apply hands files straight to a live database,
  // so anything short of stopping is a warning printed above the damage.
  if (result.state === 'untrusted') {
    console.error(result.problem)
    return 2
  }
  if (result.state === 'current') {
    console.log(`Nothing to do — ${applied.length} migration(s) already applied to ${database}`)
    return 0
  }
  if (!apply) {
    console.log(`${database} is missing ${result.pending.length} migration(s):`)
    for (const file of result.pending) console.log(`  ${file}`)
    console.log('Run again with --apply to apply them.')
    return 1
  }
  applyPending(database, result.pending)
  return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2))
