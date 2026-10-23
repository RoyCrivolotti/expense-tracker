#!/usr/bin/env node
/**
 * Compare a D1 database's real schema with what `migrations/` produces, and say what is
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
 * run left behind, so this reads the schema itself.
 *
 * What it compares: the name of every column, index and trigger, in both directions. A missing
 * trigger matters most, since nothing fails when a trigger is not there: the table it keeps up to
 * date just goes stale. It does not compare types, defaults, or what an index or trigger does, and
 * `sqlite_master` is read as it stands, so a trigger that exists with the wrong body passes.
 * A column or trigger in the database that no migration makes fails the check, as a missing one
 * does: either can change data, and the dev database is kept level with `main`. An index that no
 * migration makes only warns. It costs a written row per insert and changes no data, and a dev
 * database kept ahead of `main` while a migration is tried must not stop a production ship.
 *
 * Exit 0 when the schemas match (extra indexes aside), 1 on a difference, 2 when the database
 * could not be read.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { splitStatements } from './sql-statements.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = join(ROOT, 'migrations')

/**
 * Every column as `table.column`, and every index and trigger by name, as rows of `kind` and `name`.
 * The same query for the database under test and for the one built from the migrations, so the two
 * lists mean the same thing. SQLite's own tables and indexes are left out, and so is D1's `_cf_KV`,
 * which `pragma_table_info` refuses to read.
 */
export const SCHEMA_QUERY =
  "SELECT 'column' AS kind, m.name || '.' || p.name AS name FROM sqlite_master m, pragma_table_info(m.name) p " +
  "WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name <> '_cf_KV' " +
  "UNION ALL SELECT type AS kind, name FROM sqlite_master " +
  "WHERE type IN ('index', 'trigger') AND substr(name, 1, 7) <> 'sqlite_' AND tbl_name <> '_cf_KV'"

/**
 * One member of a schema: `table.column`, `index name` or `trigger name`.
 * @param {{ kind: string; name: string }} row
 * @returns {string}
 */
const itemOf = (row) => (row.kind === 'column' ? row.name : `${row.kind} ${row.name}`)

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
 * The columns, indexes and triggers a database has.
 * @param {{ prepare: (sql: string) => { all: () => unknown[] } }} db
 * @returns {Set<string>}
 */
export function schemaOf(db) {
  const rows = /** @type {{ kind: string; name: string }[]} */ (db.prepare(SCHEMA_QUERY).all())
  return new Set(rows.map(itemOf))
}

/**
 * Apply every migration to a database, in order.
 * @param {{ exec: (sql: string) => void }} db
 * @param {string} [dir]
 */
export function applyMigrations(db, dir = MIGRATIONS) {
  for (const file of migrationFiles(dir)) {
    for (const { sql } of splitStatements(readFileSync(join(dir, file), 'utf8'))) db.exec(sql)
  }
}

/**
 * The difference between the schema a database should have and the one it has.
 * @param {Iterable<string>} expected
 * @param {Iterable<string>} actual
 * @returns {{ missing: string[]; extra: string[] }}
 */
export function diffNames(expected, actual) {
  const want = new Set(expected)
  const have = new Set(actual)
  return {
    missing: [...want].filter((name) => !have.has(name)).sort(),
    extra: [...have].filter((name) => !want.has(name)).sort(),
  }
}

/** @param {string} text */
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The test for a statement that introduces `item`. A new table's columns are in its CREATE TABLE and a
 * later one's in an ALTER TABLE ... ADD COLUMN, so both are looked for.
 * @param {string} item
 * @returns {((statement: string) => boolean) | null}
 */
function introducing(item) {
  const object = /^(index|trigger) (\S+)$/.exec(item)
  if (object) {
    const creates = new RegExp(
      `^CREATE\\s+(TEMP(ORARY)?\\s+)?(UNIQUE\\s+)?${object[1]}\\s+(IF\\s+NOT\\s+EXISTS\\s+)?["\`\\[]?${escaped(object[2] ?? '')}\\b`,
      'i',
    )
    return (statement) => creates.test(statement)
  }
  const [table, name] = item.split('.')
  if (!table || !name) return null
  const added = new RegExp(`^ALTER\\s+TABLE\\s+${table}\\s+ADD\\s+COLUMN\\s+${name}\\b`, 'i')
  const created = new RegExp(`^CREATE\\s+TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?${table}\\b`, 'i')
  const named = new RegExp(`\\b${name}\\b`, 'i')
  return (statement) => added.test(statement) || (created.test(statement) && named.test(statement))
}

/**
 * Which migration adds a column, index or trigger, so a missing one comes with the file that would
 * fix it. The files are looked through in the order they run (the first to name it is the one that
 * introduces it), statement by statement, so a name that turns up later in the file, outside the
 * statement that makes it, is not taken for it.
 * @param {string} item  `table.column`, `index name` or `trigger name`
 * @param {{ name: string; sql: string }[]} files
 * @returns {string | null}
 */
export function migrationAdding(item, files) {
  const introduces = introducing(item)
  if (!introduces) return null
  return files.find((file) => splitStatements(file.sql).some(({ sql }) => introduces(sql)))?.name ?? null
}

/**
 * The schema of a remote D1 database, as `exec` (`execFileSync`, or a stand-in in tests) is asked for it.
 * @param {string} database
 * @param {typeof execFileSync} exec
 * @returns {Set<string>}
 */
function remoteSchema(database, exec) {
  const out = exec(
    'npx',
    ['wrangler', 'd1', 'execute', database, '--remote', '--json', '--command', SCHEMA_QUERY],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  // wrangler can print a banner before the JSON.
  const parsed = JSON.parse(out.slice(out.indexOf('[')))
  const rows = Array.isArray(parsed) ? (parsed[0]?.results ?? []) : []
  return new Set(rows.map(itemOf))
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

/** @param {Set<string>} items */
function counted(items) {
  const count = (/** @type {RegExp} */ pattern) => [...items].filter((item) => pattern.test(item)).length
  return `${count(/^[^ ]+\.[^ ]+$/)} columns, ${count(/^index /)} indexes, ${count(/^trigger /)} triggers`
}

/**
 * Compare a database's schema with the migrations in `dir`. Returns what to print and the exit code
 * rather than printing, so a test can read what a person would see.
 * @param {string} database
 * @param {{ exec?: typeof execFileSync; dir?: string }} [options]
 * @returns {Promise<{ code: 0 | 1 | 2; out: string[]; err: string[]; warn: string[] }>}
 */
export async function checkSchema(database, { exec = execFileSync, dir = MIGRATIONS } = {}) {
  const { DatabaseSync } = await import('node:sqlite')
  const fresh = new DatabaseSync(':memory:')
  applyMigrations(fresh, dir)
  const expected = schemaOf(fresh)

  let actual
  try {
    actual = remoteSchema(database, exec)
  } catch (error) {
    return {
      code: 2,
      out: [],
      err: [
        `Could not read ${database}${wranglerSaid(error)}`,
        'Is the name right, and is wrangler signed in (CLOUDFLARE_API_TOKEN, or `wrangler login`)?',
      ],
      warn: [],
    }
  }

  const { missing, extra } = diffNames(expected, actual)
  const strayIndexes = extra.filter((item) => item.startsWith('index '))
  const extraFatal = extra.filter((item) => !item.startsWith('index '))
  const warn = strayIndexes.map((item) => `WARNING ${item}  (in the database, in no migration; it costs a written row per insert and changes no data)`)
  const out = [`${database}: ${counted(actual)}; the ${migrationFiles(dir).length} migrations produce ${counted(expected)}`]
  if (missing.length === 0 && extraFatal.length === 0) {
    return { code: 0, out: [...out, warn.length > 0 ? 'No drift, apart from the warnings.' : 'No drift.'], err: [], warn }
  }

  const files = migrationFiles(dir).map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }))
  const err = [
    ...missing.map((item) => {
      const from = migrationAdding(item, files)
      return `MISSING ${item}${from ? `  (added by migrations/${from})` : ''}`
    }),
    ...extraFatal.map((item) => `EXTRA   ${item}  (in the database, in no migration)`),
    '\nThe _migrations record can say a file was applied when it was not. Apply what is missing ' +
      'deliberately (see "Migration tracking" in docs/DEPLOYMENT.md), and never re-run a whole file ' +
      'on a populated database.',
  ]
  return { code: 1, out, err, warn }
}

async function main() {
  const database = process.argv[2]
  if (!database) {
    console.error('usage: npm run check:schema -- <database-name>   (for example the dev or the production D1 name)')
    process.exit(2)
  }
  const { code, out, err, warn } = await checkSchema(database)
  for (const line of out) console.log(line)
  for (const line of warn) console.warn(line)
  for (const line of err) console.error(line)
  process.exit(code)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
