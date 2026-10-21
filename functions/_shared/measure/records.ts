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

export interface RouteResult {
  name: string
  status: number
  bytes: number
  summary: Summary
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
