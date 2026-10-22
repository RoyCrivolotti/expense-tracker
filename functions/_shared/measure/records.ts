import type { D1Database } from '@cloudflare/workers-types'

/**
 * What a measurement run notes about the statements a request issued, and how it sums them. Plain data, so
 * the adapter that fills it (scripts/scaling/d1Adapter.ts) and the route matrix that reads it need nothing
 * from each other.
 */

export interface StatementRecord {
  sql: string
  rowsRead: number
  rowsWritten: number
  /** The database's own time for the statement, in milliseconds (not network time). */
  durationMs: number
  /** Sent as part of `batch()`. */
  batch: boolean
  /** Not a plain read, by its keywords. */
  write: boolean
}

/** Filled by the database wrapper as a request runs. `calls` counts a `batch()` as one call. */
export interface Recorder {
  records: StatementRecord[]
  calls: number
}

export interface Summary {
  /** D1 calls made: each prepared statement run, and each `batch()`, counts once. */
  calls: number
  /** Statements run, counting each one inside a `batch()`. */
  statements: number
  rowsRead: number
  rowsWritten: number
  sqlMs: number
  writes: number
}

export function newRecorder(): Recorder {
  return { records: [], calls: 0 }
}

/** What happened since `mark` (the lengths taken before the request), or since the start. */
export function summarize(recorder: Recorder, mark: { records: number; calls: number } = { records: 0, calls: 0 }): Summary {
  const records = recorder.records.slice(mark.records)
  return {
    calls: recorder.calls - mark.calls,
    statements: records.length,
    rowsRead: records.reduce((sum, r) => sum + r.rowsRead, 0),
    rowsWritten: records.reduce((sum, r) => sum + r.rowsWritten, 0),
    sqlMs: records.reduce((sum, r) => sum + r.durationMs, 0),
    writes: records.filter((r) => r.write).length,
  }
}

export function markOf(recorder: Recorder): { records: number; calls: number } {
  return { records: recorder.records.length, calls: recorder.calls }
}

/** One SQL text and what it cost across every time a request ran it. */
export interface StatementTotal {
  sql: string
  runs: number
  rowsRead: number
  rowsWritten: number
  sqlMs: number
  /** Sent as part of `batch()`. */
  batch: boolean
}

/** Statements since `mark`, one entry per distinct SQL text in the order first run. The text is the template, never its values. */
export function statementsSince(recorder: Recorder, mark: { records: number }): StatementTotal[] {
  const byText = new Map<string, StatementTotal>()
  for (const record of recorder.records.slice(mark.records)) {
    const key = `${record.batch ? 'batch' : 'single'} ${record.sql}`
    const total = byText.get(key) ?? { sql: record.sql, runs: 0, rowsRead: 0, rowsWritten: 0, sqlMs: 0, batch: record.batch }
    total.runs += 1
    total.rowsRead += record.rowsRead
    total.rowsWritten += record.rowsWritten
    total.sqlMs += record.durationMs
    byText.set(key, total)
  }
  return [...byText.values()]
}

export interface RouteResult {
  name: string
  status: number
  bytes: number
  summary: Summary
  /** What each distinct statement of the request cost, so a total can be traced to the query that caused it. */
  statements: StatementTotal[]
  /** A case that is not meant to write wrote. */
  unexpectedWrite: boolean
}

export interface MeasureOptions {
  db: D1Database
  recorder: Recorder
  owner: string
  month: string
  includeWrites: boolean
}
