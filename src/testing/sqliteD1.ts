/**
 * A D1Database stand-in backed by node:sqlite, so the real SQL in `functions/_shared` can run against the
 * real migrations without Cloudflare. It enforces D1's cap on bound parameters per statement (node:sqlite
 * itself allows 32k) but not its billing, so anything about cost still has to be measured on a deployed
 * database. Import only from node-environment tests.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import type { D1Database } from '@cloudflare/workers-types'

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

/** Statements of one migration, split the way the documented `--command` fallback splits them. */
function statementsOf(file: string): string[] {
  return readFileSync(join(MIGRATIONS, file), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function migratedDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) for (const statement of statementsOf(file)) db.exec(statement)
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
  run: () => Promise<{ results: never[]; success: boolean; meta: { changes: number } }>
}

function prepared(
  db: DatabaseSync,
  sql: string,
  stats: SqliteD1Stats,
  params: SQLInputValue[],
  maxBound: number,
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
    bind: (...values) => prepared(db, sql, stats, values, maxBound),
    first: (column) =>
      checked(() => {
        const row = timed(stats, () => stmt.get(...params)) as Row | undefined
        if (row === undefined) return null
        return column === undefined ? row : row[column]
      }),
    all: () =>
      checked(() => {
        const results = timed(stats, () => stmt.all(...params)) as Row[]
        stats.rowsReturned += results.length
        return { results, success: true, meta: { rows_read: results.length, changes: 0 } }
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
        const info = timed(stats, () => stmt.run(...params))
        return { results: [], success: true, meta: { changes: Number(info.changes) } }
      }),
  }
}

function isRead(sql: string): boolean {
  return /^\s*(select|with|pragma)\b/i.test(sql)
}

/** `batch` is one transaction, as on D1: any failure rolls the whole batch back. */
export function sqliteD1(
  db: DatabaseSync,
  stats: SqliteD1Stats = newStats(),
  { maxBoundParameters = D1_MAX_BOUND_PARAMETERS }: SqliteD1Options = {},
): D1Database {
  const shim = {
    prepare: (sql: string) => prepared(db, sql, stats, [], maxBoundParameters),
    batch: async (statements: Prepared[]) => {
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
    },
  }
  return shim as unknown as D1Database
}
