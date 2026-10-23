/**
 * A D1Database stand-in backed by node:sqlite, so the real SQL in `functions/_shared` can run against the
 * real migrations without Cloudflare. It enforces D1's cap on bound parameters per statement (node:sqlite
 * itself allows 32k) but not its billing, so anything about cost still has to be measured on a deployed
 * database. `meta.changes` is the change in `total_changes()` across the statement, which is what D1 reports: it
 * counts the rows a trigger writes, where SQLite's own `changes()` does not. A count taken from it is therefore
 * wrong for any statement on a table with triggers, and a test here shows it. Import only from node-environment tests.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import type { D1Database } from '@cloudflare/workers-types'
import { splitStatements } from '../../scripts/sql-statements.mjs'

export interface SqliteD1Stats {
  statements: number
  rowsReturned: number
  /** Time spent inside SQLite itself, as opposed to the JavaScript around it. */
  sqliteMs: number
}

export function newStats(): SqliteD1Stats {
  return { statements: 0, rowsReturned: 0, sqliteMs: 0 }
}

/** What a deployed D1 accepts in one statement: 100 bound parameters runs, 101 fails. */
export const D1_MAX_BOUND_PARAMETERS = 100

export interface SqliteD1Options {
  /** Statements binding more values than this are rejected as D1 does. `Infinity` lifts the limit. */
  maxBoundParameters?: number
}

const MIGRATIONS = join(import.meta.dirname, '..', '..', 'migrations')

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

/**
 * Runs migration SQL one statement at a time, the way the documented `--command` fallback does, cut by the
 * splitter the lint and the schema check use, so a trigger is applied whole.
 */
export function applyMigrationSql(db: DatabaseSync, sql: string): void {
  for (const statement of splitStatements(sql)) db.exec(statement.sql)
}

/** Applies one migration file from `migrations/`. */
export function applyMigration(db: DatabaseSync, file: string): void {
  applyMigrationSql(db, readFileSync(join(MIGRATIONS, file), 'utf8'))
}

/** All the migrations, or those up to and including the file whose name starts with `through` (`'0037'`). */
export function migratedDatabase(through?: string): DatabaseSync {
  // Taken from the process and not imported: a test that runs in jsdom resolves its imports as a browser would, and Vite
  // refuses `node:sqlite` there on Node 22, whose list of built-in modules does not have it.
  const { DatabaseSync: Database } = process.getBuiltinModule('node:sqlite')
  const db = new Database(':memory:')
  for (const file of migrationFiles()) {
    if (through !== undefined && file.slice(0, through.length) > through) break
    applyMigration(db, file)
  }
  return db
}

function timed<T>(stats: SqliteD1Stats, fn: () => T): T {
  const start = performance.now()
  try {
    return fn()
  } finally {
    stats.sqliteMs += performance.now() - start
    stats.statements += 1
  }
}

/** Runs synchronously, but hands back a promise that rejects on a throw, as D1's methods do. */
function settle<T>(fn: () => T): Promise<T> {
  return new Promise((resolve) => resolve(fn()))
}

type Row = Record<string, unknown>

interface Prepared {
  sql: string
  bind: (...values: SQLInputValue[]) => Prepared
  first: (column?: string) => Promise<unknown>
  all: () => Promise<{ results: Row[]; success: boolean; meta: { rows_read: number; changes: number } }>
  raw: () => Promise<unknown[][]>
  run: () => Promise<{ results: Row[]; success: boolean; meta: { changes: number } }>
}

function prepared(
  db: DatabaseSync,
  sql: string,
  stats: SqliteD1Stats,
  params: SQLInputValue[],
  maxBound: number,
  changed: () => number,
): Prepared {
  const stmt = db.prepare(sql)
  const checked = <T>(fn: () => T): Promise<T> =>
    settle(() => {
      if (params.length > maxBound) {
        throw new Error(`D1_ERROR: too many SQL variables: SQLITE_ERROR (${params.length} bound, limit ${maxBound})`)
      }
      return fn()
    })
  return {
    sql,
    bind: (...values) => prepared(db, sql, stats, values, maxBound, changed),
    first: (column) =>
      checked(() => {
        const row = timed(stats, () => stmt.get(...params)) as Row | undefined
        if (row === undefined) return null
        return column === undefined ? row : row[column]
      }),
    all: () =>
      checked(() => {
        const before = changed()
        const results = timed(stats, () => stmt.all(...params)) as Row[]
        stats.rowsReturned += results.length
        return { results, success: true, meta: { rows_read: results.length, changes: changed() - before } }
      }),
    raw: () =>
      checked(() => {
        stmt.setReturnArrays(true)
        const results = timed(stats, () => stmt.all(...params)) as unknown as unknown[][]
        stats.rowsReturned += results.length
        return results
      }),
    run: () =>
      checked(() => {
        const before = changed()
        // A statement with RETURNING sends its rows back from `run` as well, as D1 does.
        const results = RETURNING.test(sql) ? (timed(stats, () => stmt.all(...params)) as Row[]) : (timed(stats, () => stmt.run(...params)), [])
        stats.rowsReturned += results.length
        return { results, success: true, meta: { changes: changed() - before } }
      }),
  }
}

const RETURNING = /\bRETURNING\b/i

function isRead(sql: string): boolean {
  return /^\s*(select|with|pragma)\b/i.test(sql)
}

/** One batch as one transaction: any failure rolls the whole batch back. */
async function runBatch(db: DatabaseSync, statements: Prepared[]) {
  db.exec('BEGIN')
  try {
    const out = []
    for (const s of statements) out.push(isRead(s.sql) ? await s.all() : await s.run())
    db.exec('COMMIT')
    return out
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

/**
 * `batch` is one transaction, as on D1, and batches run one after another, as on D1. Every statement is awaited
 * between the BEGIN and the COMMIT here, so two requests that batch at once would otherwise open a transaction
 * inside the other's.
 */
export function sqliteD1(
  db: DatabaseSync,
  stats: SqliteD1Stats = newStats(),
  { maxBoundParameters = D1_MAX_BOUND_PARAMETERS }: SqliteD1Options = {},
): D1Database {
  let turn: Promise<unknown> = Promise.resolve()
  const total = db.prepare('SELECT total_changes() AS n')
  const changed = (): number => Number((total.get() as { n: number | bigint }).n)
  const shim = {
    prepare: (sql: string) => prepared(db, sql, stats, [], maxBoundParameters, changed),
    batch: (statements: Prepared[]) => {
      const run = turn.then(() => runBatch(db, statements))
      turn = run.catch(() => undefined)
      return run
    },
  }
  return shim as unknown as D1Database
}
