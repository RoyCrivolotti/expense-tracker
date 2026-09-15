#!/usr/bin/env node
/**
 * Apply pending migrations to roy-expenses-dev (remote).
 *
 * Only files absent from `_migrations` are executed. Re-running is not merely noisy:
 * 0003 reassigns every row to a placeholder owner and drops four tables after its
 * first statement fails.
 *
 * Seeding `_migrations` for an already-migrated database is a manual one-off — see
 * "Migration tracking" in docs/DEPLOYMENT.md. Doing it here would make a fresh
 * database skip 0001-0019.
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

function wrangler(args) {
  return execFileSync('npx', ['wrangler', 'd1', 'execute', DB, '--remote', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  })
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

  if (alreadyApplied.length === 0 && files.length > 1) {
    console.warn(
      `\n${DB} has no _migrations rows.\n` +
        `If this database is NOT brand new, stop and seed the table first — see\n` +
        `"Migration tracking" in docs/DEPLOYMENT.md. Re-applying 0003 to a populated\n` +
        `database reassigns every row to a placeholder owner and drops four tables.\n`,
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
