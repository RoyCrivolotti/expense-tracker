import type { Env } from './env'

/**
 * Chunked backup is off unless `BACKUP_MODE` is `chunked`, ignoring case and surrounding spaces. Unset, empty or
 * anything else keeps the daily single-file snapshot, so deploying this code changes nothing until someone sets the
 * variable.
 */
export interface ChunkedBackupSettings {
  enabled: boolean
  /** D1 queries plus bucket calls one invocation may make. The Free plan allows 50 subrequests. */
  maxOperations: number
  /** Rows one invocation may read and write; this is what keeps it inside the Worker's CPU time. */
  maxRows: number
}

export const DEFAULT_STEP_OPERATIONS = 44
/**
 * A day's backup can hold as many rows as the runs in its window times this. A ledger of 50,000 transactions is
 * about 50,300 rows and takes 18 runs at this size, against the 24 that a trigger every ten minutes from 04:00 to
 * 07:50 gives (docs/BACKUPS.md). At 1,500 the same ledger needs 35, so it was never finished before midnight.
 */
export const DEFAULT_STEP_ROWS = 3_000
/** Enough to start a run, read a chunk and finish or save; below it an invocation could make no progress. */
export const MIN_STEP_OPERATIONS = 12
/**
 * Under the Free plan's 50 subrequests with room for the three calls that follow a finished day (listing the
 * bucket, one delete for what has expired, listing it again for its size).
 */
export const MAX_STEP_OPERATIONS = 46

function parseWithin(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw?.trim()) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback
}

export function resolveChunkedBackup(
  env: Pick<Env, 'BACKUP_MODE' | 'BACKUP_STEP_MAX_OPERATIONS' | 'BACKUP_STEP_MAX_ROWS'>,
): ChunkedBackupSettings {
  return {
    enabled: env.BACKUP_MODE?.trim().toLowerCase() === 'chunked',
    maxOperations: parseWithin(
      env.BACKUP_STEP_MAX_OPERATIONS,
      DEFAULT_STEP_OPERATIONS,
      MIN_STEP_OPERATIONS,
      MAX_STEP_OPERATIONS,
    ),
    maxRows: parseWithin(env.BACKUP_STEP_MAX_ROWS, DEFAULT_STEP_ROWS, 100, 1_000_000),
  }
}
