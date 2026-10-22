/**
 * What a chunked backup writes. A day's backup of one owner is a folder in the bucket (see `backupKeys.ts`):
 * parts of NDJSON, a `state.json` while it is being made, and a `manifest.json` that is written last. The
 * manifest is what makes it a backup: without one the folder is a run that has not finished, and nothing
 * reads it. The older format, one `{owner}/{date}.json` holding the whole dataset, is unchanged and still read.
 */
import { EXPORT_FORMAT, EXPORT_TABLES, type ExportTable } from '../domain/data/exportTables'

export const BACKUP_FORMAT = 1

export interface BackupPart {
  key: string
  rows: number
  /** Characters, as the single-file snapshot's size is counted. */
  bytes: number
}

export type TableCounts = Record<ExportTable, number>

export function emptyCounts(): TableCounts {
  return Object.fromEntries(EXPORT_TABLES.map((table) => [table, 0])) as TableCounts
}

/** Where a run stands between two invocations. Saved after every part, and read to carry on. */
export interface BackupState {
  format: typeof BACKUP_FORMAT
  owner: string
  dateKey: string
  startedAt: string
  /** The owner's revision when the run began; compared with the revision at the end. */
  revision: string | null
  /** Which pass over the ledger this is: it starts again, up to a limit, when the ledger is written to meanwhile. */
  attempt: number
  /** Set when the last pass was spoiled too, so that the day has no backup and nothing more is spent on it. */
  failed: boolean
  /** Index in `EXPORT_TABLES` of the table being read, and the position to continue after in it. */
  table: number
  after: string | null
  nextPart: number
  parts: BackupPart[]
  counts: TableCounts
}

export interface BackupManifest {
  format: typeof BACKUP_FORMAT
  exportFormat: number
  owner: string
  dateKey: string
  startedAt: string
  finishedAt: string
  /** The owner's dataset revision at the start; it was the same at the end, or there would be no manifest. */
  revision: string | null
  tables: TableCounts
  parts: BackupPart[]
  bytes: number
}

/** One line of a part: a row and the table it belongs to. */
export interface PartLine {
  t: ExportTable
  r: object
}

export class BackupFormatError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0

function isCounts(value: unknown): value is TableCounts {
  return isRecord(value) && EXPORT_TABLES.every((table) => isCount(value[table]))
}

function isPart(value: unknown): value is BackupPart {
  return isRecord(value) && typeof value.key === 'string' && isCount(value.rows) && isCount(value.bytes)
}

function json(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

const isText = (value: unknown): value is string => typeof value === 'string'
const isTextOrNull = (value: unknown): boolean => value === null || isText(value)

/** The fields of a state, apart from whose and which day's it is. */
function hasStateShape(value: Record<string, unknown>): boolean {
  return (
    isText(value.startedAt) &&
    isTextOrNull(value.revision) &&
    isTextOrNull(value.after) &&
    isCount(value.table) &&
    value.table <= EXPORT_TABLES.length &&
    isCount(value.nextPart) &&
    isCount(value.attempt) &&
    typeof value.failed === 'boolean' &&
    Array.isArray(value.parts) &&
    value.parts.every(isPart) &&
    isCounts(value.counts)
  )
}

/** The saved state, or null when it is not one this code wrote: the run then starts again, over its own parts. */
export function parseBackupState(text: string | null, owner: string, dateKey: string): BackupState | null {
  const value = text === null ? undefined : json(text)
  if (!isRecord(value) || value.format !== BACKUP_FORMAT) return null
  if (value.owner !== owner || value.dateKey !== dateKey) return null
  return hasStateShape(value) ? (value as unknown as BackupState) : null
}

/** Throws {@link BackupFormatError} for a manifest this code cannot trust. */
export function parseBackupManifest(text: string): BackupManifest {
  const value = json(text)
  if (!isRecord(value) || value.format !== BACKUP_FORMAT) {
    throw new BackupFormatError('Not a backup manifest this code can read')
  }
  if (value.exportFormat !== EXPORT_FORMAT) {
    throw new BackupFormatError(`The rows were exported in format ${String(value.exportFormat)}, not ${EXPORT_FORMAT}`)
  }
  const ok =
    typeof value.owner === 'string' &&
    typeof value.dateKey === 'string' &&
    isCounts(value.tables) &&
    Array.isArray(value.parts) &&
    value.parts.every(isPart)
  if (!ok) throw new BackupFormatError('The backup manifest is incomplete')
  return value as unknown as BackupManifest
}
