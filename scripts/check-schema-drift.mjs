#!/usr/bin/env node
/**
 * Compare a D1 database's real columns with what `migrations/` produces, and say what is
 * missing, with the migration that adds it.
 *
 *   npm run check:schema -- <database-name>
 *
 * Read-only: it only runs a SELECT over the table list. It needs wrangler to be signed in
 * (CLOUDFLARE_API_TOKEN, or `wrangler login`).
 *
 * Why this exists. Migrations here are applied by hand and recorded in `_migrations`, and the
 * record has been wrong twice: production said 0013 was applied and had no
 * goal_scenarios.life_events (scenario saves failed), and said 0026 was applied and had no
 * settings.investment_category_id. A record of what was run cannot show what a failed or partial
 * run left behind, so this reads the schema itself. Columns only: it does not compare types,
 * defaults or indexes, which have not been the way it has gone wrong.
 *
 * Exit 0 when the columns match, 1 on a difference, 2 when the database could not be read.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = join(ROOT, 'migrations')

/**
 * Every table and column, as `table.column`. The same query for the database under test and for
 * the one built from the migrations, so the two lists mean the same thing. SQLite's own tables
 * are left out, and so is D1's `_cf_KV`, which `pragma_table_info` refuses to read.
 */
export const COLUMNS_QUERY =
  "SELECT m.name AS t, p.name AS c FROM sqlite_master m, pragma_table_info(m.name) p " +
  "WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name <> '_cf_KV'"

/**
 * A migration's statements, comments removed, one at a time, the way the documented `--command`
 * fallback runs them.
 * @param {string} sql
 * @returns {string[]}
 */
export function statementsOf(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
}

/**
 * The migration files, in order.
 * @param {string} [dir]
 * @returns {string[]}
 */
export function migrationFiles(dir = MIGRATIONS) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
}

/**
 * The columns the migrations produce, from a database they have been applied to.
 * @param {{ prepare: (sql: string) => { all: () => unknown[] } }} db
 * @returns {Set<string>}
 */
export function columnsOf(db) {
  const rows = /** @type {{ t: string; c: string }[]} */ (db.prepare(COLUMNS_QUERY).all())
  return new Set(rows.map((row) => `${row.t}.${row.c}`))
}

/**
 * Apply every migration to a database, in order.
 * @param {{ exec: (sql: string) => void }} db
 * @param {string} [dir]
 */
export function applyMigrations(db, dir = MIGRATIONS) {
  for (const file of migrationFiles(dir)) {
    for (const statement of statementsOf(readFileSync(join(dir, file), 'utf8'))) db.exec(statement)
  }
}

/**
 * The difference between the columns a database should have and the ones it has.
 * @param {Iterable<string>} expected
 * @param {Iterable<string>} actual
 * @returns {{ missing: string[]; extra: string[] }}
 */
export function diffColumns(expected, actual) {
  const want = new Set(expected)
  const have = new Set(actual)
  return {
    missing: [...want].filter((column) => !have.has(column)).sort(),
    extra: [...have].filter((column) => !want.has(column)).sort(),
  }
}

/**
 * Which migration adds a column, so a missing one comes with the file that would fix it. A new
 * table's columns are in its CREATE TABLE and a later one's in an ALTER TABLE ... ADD COLUMN, so
 * both are looked for, in the order the files run (the first to name the column is the one
 * that introduces it).
 * @param {string} column  `table.column`
 * @param {{ name: string; sql: string }[]} files
 * @returns {string | null}
 */
export function migrationAdding(column, files) {
  const [table, name] = column.split('.')
  if (!table || !name) return null
  const added = new RegExp(`^ALTER\\s+TABLE\\s+${table}\\s+ADD\\s+COLUMN\\s+${name}\\b`, 'i')
  const created = new RegExp(`^CREATE\\s+TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?${table}\\b`, 'i')
  const named = new RegExp(`\\b${name}\\b`, 'i')
  // Statement by statement, so a name that turns up later in the file, outside the table's own
  // definition, is not taken for its column.
  const introduces = (statement) => added.test(statement) || (created.test(statement) && named.test(statement))
  return files.find((file) => statementsOf(file.sql).some(introduces))?.name ?? null
}

/**
 * The columns of a remote D1 database.
 * @param {string} database
 * @returns {Set<string>}
 */
function remoteColumns(database) {
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', database, '--remote', '--json', '--command', COLUMNS_QUERY],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  // wrangler can print a banner before the JSON.
  const parsed = JSON.parse(out.slice(out.indexOf('[')))
  const rows = Array.isArray(parsed) ? (parsed[0]?.results ?? []) : []
  return new Set(rows.map((row) => `${row.t}.${row.c}`))
}

/**
 * What wrangler said when it failed, as `: reason`, or nothing. With `--json` it reports an error
 * as JSON on stdout (`{ error: { text, notes } }`), and otherwise on stderr; the command line the
 * failure carries as its message is the one part that does not explain it.
 * @param {unknown} error
 * @returns {string}
 */
export function wranglerSaid(error) {
  if (!error || typeof error !== 'object') return ''
  const { stdout = '', stderr = '' } = /** @type {{ stdout?: unknown; stderr?: unknown }} */ (error)
  const out = String(stdout)
  const start = out.indexOf('{')
  if (start >= 0) {
    try {
      const { error: reported } = JSON.parse(out.slice(start))
      const notes = Array.isArray(reported?.notes) ? reported.notes.map((n) => n?.text).filter(Boolean) : []
      const said = [reported?.text, ...notes].filter(Boolean).join(' ')
      if (said) return `: ${said}`
    } catch {
      // Not JSON after all; fall through to what stderr has.
    }
  }
  const lines = String(stderr).trim().split('\n').filter(Boolean).slice(-2)
  return lines.length > 0 ? `: ${lines.join(' ')}` : ''
}

async function main() {
  const database = process.argv[2]
  if (!database) {
    console.error('usage: npm run check:schema -- <database-name>   (for example the dev or the production D1 name)')
    process.exit(2)
  }

  const { DatabaseSync } = await import('node:sqlite')
  const fresh = new DatabaseSync(':memory:')
  applyMigrations(fresh)
  const expected = columnsOf(fresh)

  let actual
  try {
    actual = remoteColumns(database)
  } catch (error) {
    console.error(`Could not read ${database}${wranglerSaid(error)}`)
    console.error('Is the name right, and is wrangler signed in (CLOUDFLARE_API_TOKEN, or `wrangler login`)?')
    process.exit(2)
  }

  const { missing, extra } = diffColumns(expected, actual)
  console.log(`${database}: ${actual.size} columns; the ${migrationFiles().length} migrations produce ${expected.size}`)
  if (missing.length === 0 && extra.length === 0) {
    console.log('No drift.')
    return
  }

  const files = migrationFiles().map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), 'utf8') }))
  for (const column of missing) {
    const from = migrationAdding(column, files)
    console.error(`MISSING ${column}${from ? `  (added by migrations/${from})` : ''}`)
  }
  for (const column of extra) console.error(`EXTRA   ${column}  (in the database, in no migration)`)
  console.error(
    '\nThe _migrations record can say a file was applied when it was not. Apply what is missing ' +
      'deliberately (see "Migration tracking" in docs/DEPLOYMENT.md), and never re-run a whole file ' +
      'on a populated database.',
  )
  process.exit(1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
