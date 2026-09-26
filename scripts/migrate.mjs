#!/usr/bin/env node
/**
 * Apply pending migrations to the dev and/or production D1 database (remote).
 *
 * The deploy workflow runs `node scripts/migrate.mjs all --yes` when a PR merges, before it
 * deploys the code that needs the new columns. Locally:
 *
 *   npm run migrate:status                  what dev and production are each missing; changes nothing
 *   npm run migrate:dev                     apply to dev, for a PR preview whose migration is not in yet
 *   node scripts/migrate.mjs all --yes      what the workflow does; production needs --yes
 *
 * Only files absent from `_migrations` are executed. Re-running is not merely noisy:
 * 0003 reassigns every row to a placeholder owner and drops four tables after its
 * first statement fails.
 *
 * Seeding `_migrations` for an already-migrated database is a manual one-off; see
 * "Migration tracking" in docs/DEPLOYMENT.md. Doing it here would make a fresh
 * database skip 0001-0019, so the script refuses to run against a database whose
 * record it cannot trust rather than guessing which of the two it is looking at.
 *
 * With more than one database, every record is read and checked before anything is
 * applied to any of them, so a record that cannot be trusted stops the run at the start
 * instead of after dev has already moved. Dev goes first and a failure there stops the
 * run before production is touched.
 *
 * Each file is recorded in the same import that applies it. Wrangler says an import that
 * fails to complete leaves the database as it was, so applying and recording go together
 * where the two-command version left a gap between them for the next run to fall into.
 * File names are held to `MIGRATION_FILE` because the name is written into that record.
 *
 * A file that drops or renames something is refused unless it says it is meant to (see
 * `destructiveReason`): migrations run before the new code deploys, so what they change
 * has to work with the release that is live while they run.
 *
 * The script trusts `_migrations`: it cannot tell that a database says a file was
 * applied when the schema disagrees. Check that separately, as DEPLOYMENT.md describes.
 * What it will not do is guess: a read that fails for any reason but the table not existing
 * yet stops the run, since "nothing recorded" would otherwise be read as a fresh database.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATABASES = {
  dev: process.env.DEV_D1_NAME ?? 'roy-expenses-dev',
  prod: process.env.PROD_D1_NAME ?? 'roy-expenses',
}
const TRACKING_MIGRATION = '0020_migrations_table.sql'

/**
 * Migration stem, as recorded in `_migrations.name` (no directory, no extension).
 * @param {string} file
 * @returns {string}
 */
export function stemOf(file) {
  return file.replace(/\.sql$/, '')
}

/** What a migration file is called: its number, then lowercase words. The name is written into SQL. */
export const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/

/**
 * `.sql` files in the migrations directory that do not follow `MIGRATION_FILE`.
 * @param {string[]} files
 * @returns {string[]}
 */
export function invalidMigrationNames(files) {
  return files.filter((f) => f.endsWith('.sql') && !MIGRATION_FILE.test(f))
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

/**
 * The order to apply pending files in: the tracking table has to exist before anything
 * can be recorded against it, so its migration goes first.
 * @param {string[]} pending
 * @returns {string[]}
 */
export function applyOrder(pending) {
  return pending.includes(TRACKING_MIGRATION)
    ? [TRACKING_MIGRATION, ...pending.filter((f) => f !== TRACKING_MIGRATION)]
    : pending
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
 * Why a database's record cannot be trusted, or null when it can. A problem stops the run
 * rather than warning: the apply loop hands files straight to a live database, so anything
 * short of stopping is a warning printed above the damage.
 * @param {string} db
 * @param {string[]} files
 * @param {string[]} appliedNames
 * @param {() => boolean} hasApplicationTables asked only when the record is empty
 * @returns {string | null}
 */
export function recordProblem(db, files, appliedNames, hasApplicationTables) {
  const pending = selectPendingMigrations(files, appliedNames)
  const backfills = backfillsBelowHighestApplied(pending, appliedNames)
  if (backfills.length > 0) {
    return (
      `${db} records ${appliedNames.length} migration(s) but ${backfills.length} earlier ` +
      `file(s) are unrecorded, starting with ${backfills[0]}.\n` +
      `A database cannot have reached the later ones without these, so the record is ` +
      `incomplete rather than the files being pending.\n` +
      `Seed _migrations before running this again. See "Migration tracking" in ` +
      `docs/DEPLOYMENT.md; applying 0003 to a populated database drops four tables.`
    )
  }
  if (appliedNames.length === 0 && files.length > 1 && hasApplicationTables()) {
    return (
      `${db} has application tables but no _migrations rows, so it is an existing ` +
      `database with an unseeded record, not a fresh one.\n` +
      `Seed _migrations before running this again. See "Migration tracking" in ` +
      `docs/DEPLOYMENT.md; applying 0003 to a populated database drops four tables.`
    )
  }
  return null
}

/**
 * Which databases a run covers, and how.
 * @param {string[]} argv
 * @returns {{ targets: ('dev' | 'prod')[], dryRun: boolean, yes: boolean }}
 */
export function parseArgs(argv) {
  const flags = argv.filter((a) => a.startsWith('--'))
  const words = argv.filter((a) => !a.startsWith('--'))
  const unknown = flags.filter((f) => f !== '--dry-run' && f !== '--yes')
  if (unknown.length > 0) throw new Error(`Unknown option ${unknown[0]}. Use --dry-run or --yes.`)
  const [target = 'dev', ...extra] = words
  if (extra.length > 0 || !['dev', 'prod', 'all'].includes(target)) {
    throw new Error(`Unknown target "${words.join(' ')}". Use dev, prod or all.`)
  }
  return {
    targets: target === 'all' ? ['dev', 'prod'] : [target],
    dryRun: flags.includes('--dry-run'),
    yes: flags.includes('--yes'),
  }
}

/**
 * Why production is not being touched by this run, or null when it is fine to go on.
 * Applying there is what the deploy workflow does on merge, so from a terminal it takes
 * `--yes` to say that was meant.
 * @param {{ targets: string[], dryRun: boolean, yes: boolean }} run
 * @returns {string | null}
 */
export function productionRefusal({ targets, dryRun, yes }) {
  if (!targets.includes('prod') || dryRun || yes) return null
  return 'Production is migrated by the deploy workflow when a PR merges. To do it from here, pass --yes.'
}

const DESTRUCTIVE = /\b(?:DROP\s+(?:TABLE|COLUMN|VIEW|TRIGGER|INDEX)|DELETE\s+FROM|ALTER\s+TABLE\s+\S+\s+(?:RENAME|DROP))\b/i
const DESTRUCTIVE_OK = /^\s*--\s*migrate:\s*destructive-ok\b/im

/**
 * The first statement in a migration that would break the release already running while it
 * applies, or null when there is none or the file says it is meant to. A view or trigger the
 * live release queries or relies on, and an index behind an `ON CONFLICT` or a uniqueness
 * check, go the same way a table does. This is a net for the obvious cases, not a proof. Migrations go in
 * before the new code deploys, so dropping or renaming what the live release still reads
 * is an outage; that takes two PRs, one that stops reading it and one that drops it, and
 * the second carries `-- migrate: destructive-ok` to say the first has shipped.
 * @param {string} sql
 * @returns {string | null}
 */
export function destructiveReason(sql) {
  if (DESTRUCTIVE_OK.test(sql)) return null
  const code = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '')
  return code.match(DESTRUCTIVE)?.[0].replace(/\s+/g, ' ') ?? null
}

/**
 * A migration together with the statement that records it, to be sent as one import so the
 * two land together or not at all. Every migration ends in a semicolon (a test holds them
 * to it), so the record can simply follow.
 * @param {string} sql
 * @param {string} file
 * @returns {string}
 */
export function withRecord(sql, file) {
  if (!MIGRATION_FILE.test(file)) throw new Error(`"${file}" is not a migration file name, so it cannot be written into the record.`)
  return `${sql.trimEnd()}\nINSERT OR IGNORE INTO _migrations (name) VALUES ('${stemOf(file)}');\n`
}

/**
 * One line saying what a database is missing.
 * @param {string} target
 * @param {string} db
 * @param {number} applied
 * @param {string[]} ordered
 * @returns {string}
 */
export function describePlan(target, db, applied, ordered) {
  const pending = ordered.length === 0 ? 'nothing pending' : `${ordered.length} pending: ${ordered.join(', ')}`
  return `${target.padEnd(4)}  ${db}  ${applied} applied, ${pending}`
}

function wrangler(db, args) {
  return execFileSync('npx', ['wrangler', 'd1', 'execute', db, '--remote', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  })
}

/**
 * Whether a failed query failed only because the table it read is not there. That is the one
 * failure that means something (a database that has not been set up), so it is the one that
 * is not an error; an auth failure, a timeout or an outage says nothing about the record.
 * @param {{ stdout?: unknown, stderr?: unknown, message?: unknown }} error
 * @returns {boolean}
 */
export function isMissingTable(error) {
  return /no such table/i.test([error?.stdout, error?.stderr, error?.message].filter(Boolean).join('\n'))
}

/**
 * The names a `SELECT name FROM _migrations` returned, from wrangler's `--json` output. An
 * output that is not the shape expected is an error, not an empty record.
 * @param {string} out
 * @returns {string[]}
 */
export function namesFromOutput(out) {
  const parsed = JSON.parse(out)
  const results = Array.isArray(parsed) ? parsed[0]?.results : parsed?.result?.[0]?.results
  if (!Array.isArray(results)) throw new Error('unexpected output from wrangler')
  return results.map((r) => r.name)
}

/** The last line wrangler had to say about a failure, for a message that says why. */
function failureText(e) {
  const lines = [e?.stderr, e?.stdout, e?.message].filter(Boolean).join('\n').split('\n').map((l) => l.trim()).filter(Boolean)
  return (lines.at(-1) ?? 'no output').slice(0, 300)
}

/**
 * Whether the database already carries the schema, regardless of what `_migrations`
 * says. The only honest way to tell a fresh database from an existing one whose record
 * was never seeded, and the two need opposite treatment. Throws when it cannot tell.
 */
function hasApplicationTables(db) {
  try {
    wrangler(db, ['--command', 'SELECT 1 FROM transactions LIMIT 1'])
    return true
  } catch (e) {
    if (isMissingTable(e)) return false
    throw new Error(`Could not tell whether ${db} has its tables: ${failureText(e)}`, { cause: e })
  }
}

function appliedNames(db) {
  let out
  try {
    out = wrangler(db, ['--json', '--command', 'SELECT name FROM _migrations'])
  } catch (e) {
    // No table yet: everything is pending, including the migration that creates it.
    // Correct for a fresh database; for an existing one, seed it first.
    if (isMissingTable(e)) return []
    throw new Error(`Could not read ${db}'s _migrations: ${failureText(e)}`, { cause: e })
  }
  try {
    return namesFromOutput(out)
  } catch (e) {
    throw new Error(`Could not read ${db}'s _migrations: ${e instanceof Error ? e.message : e}`, { cause: e })
  }
}

/**
 * Reads one database's record and decides what is pending, throwing if it cannot be trusted.
 * The SQL is read here, once, so what is checked is what is sent.
 * @param {'dev' | 'prod'} target
 * @param {string[]} files
 */
function planFor(target, files) {
  const db = DATABASES[target]
  const applied = appliedNames(db)
  const problem = recordProblem(db, files, applied, () => hasApplicationTables(db))
  if (problem) throw new Error(problem)
  const migrations = applyOrder(selectPendingMigrations(files, applied)).map((file) => ({
    file,
    sql: readFileSync(join(ROOT, 'migrations', file), 'utf8'),
  }))
  // A fresh database has nothing to lose and nothing running against it, so its whole
  // history goes in, drops and all.
  const risky = applied.length === 0 ? undefined : migrations.map((m) => ({ file: m.file, reason: destructiveReason(m.sql) })).find((m) => m.reason)
  if (risky) {
    throw new Error(
      `${risky.file} would ${risky.reason} on ${db} while the release that is live still runs.\n` +
        `Split it: stop reading the thing in one PR and drop it in the next, and put ` +
        `"-- migrate: destructive-ok" in the file once the first has shipped.`,
    )
  }
  return { target, db, applied: applied.length, migrations }
}

function apply({ db, migrations }) {
  const dir = mkdtempSync(join(tmpdir(), 'migrate-'))
  try {
    for (const { file, sql } of migrations) {
      console.log(`Applying ${file} to ${db}…`)
      const path = join(dir, file)
      writeFileSync(path, withRecord(sql, file))
      execFileSync('npx', ['wrangler', 'd1', 'execute', db, '--remote', `--file=${path}`], {
        cwd: ROOT,
        stdio: 'inherit',
      })
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  console.log(`Done — applied ${migrations.length} migration(s) to ${db}`)
}

function main() {
  const run = parseArgs(process.argv.slice(2))
  const refusal = productionRefusal(run)
  if (refusal) throw new Error(refusal)

  const files = readdirSync(join(ROOT, 'migrations'))
  const badNames = invalidMigrationNames(files)
  if (badNames.length > 0) throw new Error(`Migration file names must look like 0028_short_name.sql: ${badNames.join(', ')}`)

  // Everything is read and checked before anything is applied, in any database, and every
  // database is reported even when an earlier one has a problem, so one run shows the lot.
  const plans = []
  const problems = []
  for (const target of run.targets) {
    try {
      plans.push(planFor(target, files))
    } catch (e) {
      problems.push(`${target}: ${e instanceof Error ? e.message : e}`)
    }
  }
  for (const p of plans) console.log(describePlan(p.target, p.db, p.applied, p.migrations.map((m) => m.file)))
  if (problems.length > 0) throw new Error(problems.join('\n\n'))
  if (run.dryRun) return
  for (const plan of plans) if (plan.migrations.length > 0) apply(plan)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  }
}
