/**
 * A D1Database stand-in backed by node:sqlite, so the real SQL in `functions/_shared` can run against the
 * real migrations without Cloudflare. It cannot reproduce D1's billing or limits (node:sqlite allows 32k
 * bound variables where D1 allows 100, and has no row-read meter), so anything about cost still has to be
 * measured on a deployed database. Import only from node-environment tests.
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
): Prepared {
  const stmt = db.prepare(sql)
  return {
    sql,
    bind: (...values) => prepared(db, sql, stats, values),
    first: (column) =>
      settle(() => {
        const row = timed(stats, () => stmt.get(...params)) as Row | undefined
        if (row === undefined) return null
        return column === undefined ? row : row[column]
      }),
    all: () =>
      settle(() => {
        const results = timed(stats, () => stmt.all(...params)) as Row[]
        stats.rowsReturned += results.length
        return { results, success: true, meta: { rows_read: results.length, changes: 0 } }
      }),
    raw: () =>
      settle(() => {
        stmt.setReturnArrays(true)
        const results = timed(stats, () => stmt.all(...params)) as unknown as unknown[][]
        stats.rowsReturned += results.length
        return results
      }),
    run: () =>
      settle(() => {
        const info = timed(stats, () => stmt.run(...params))
        return { results: [], success: true, meta: { changes: Number(info.changes) } }
      }),
  }
}

function isRead(sql: string): boolean {
  return /^\s*(select|with|pragma)\b/i.test(sql)
}

/** `batch` is one transaction, as on D1: any failure rolls the whole batch back. */
export function sqliteD1(db: DatabaseSync, stats: SqliteD1Stats = newStats()): D1Database {
  const shim = {
    prepare: (sql: string) => prepared(db, sql, stats, []),
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
