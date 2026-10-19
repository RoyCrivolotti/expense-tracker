/**
 * Reading a backup back. Both formats come out as the same thing, the rows of every table, which
 * `restoreSql.ts` turns into statements: the single-file snapshot of the older backup, which is a whole dataset,
 * and the folder a chunked backup writes. A chunked backup is checked against its manifest part by part and table
 * by table, so a part that is missing, cut short or from another run is an error and not a restore that quietly
 * lacks rows.
 */
import { EXPORT_TABLES, isExportTable, type ExportTable } from '../domain/data/exportTables'
import type { ExpenseDataset } from '../domain/types'
import { ownerBackupKey, manifestKey } from './backupKeys'
import { BackupFormatError, emptyCounts, parseBackupManifest, type BackupManifest } from './backupFormat'
import { emptyTables, tablesOfDataset, type BackupTables } from './restoreSql'

/** Anything that can hand back an object's text: the bucket, or a folder of downloaded files. */
export interface BackupReader {
  get(key: string): Promise<string | null>
}

export interface ReadBackup {
  kind: 'snapshot' | 'chunked'
  tables: BackupTables
  /** Present for a chunked backup. */
  manifest?: BackupManifest
}

function parseLine(line: string, partKey: string): { t: ExportTable; r: object } {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    throw new BackupFormatError(`${partKey} holds a line that is not JSON`)
  }
  const { t, r } = (value ?? {}) as { t?: unknown; r?: unknown }
  if (!isExportTable(t) || r === null || typeof r !== 'object') {
    throw new BackupFormatError(`${partKey} holds a line that is not a row of a table`)
  }
  return { t, r }
}

async function readPart(reader: BackupReader, part: BackupManifest['parts'][number], tables: BackupTables) {
  const text = await reader.get(part.key)
  if (text === null) throw new BackupFormatError(`The part ${part.key} is missing`)
  if (text.length !== part.bytes) {
    throw new BackupFormatError(`The part ${part.key} is ${text.length} characters, not the ${part.bytes} the manifest records`)
  }
  const lines = text.split('\n').filter(Boolean)
  if (lines.length !== part.rows) {
    throw new BackupFormatError(`The part ${part.key} holds ${lines.length} rows, not the ${part.rows} the manifest records`)
  }
  for (const line of lines) {
    const { t, r } = parseLine(line, part.key)
    tables[t].push(r)
  }
}

async function readChunked(reader: BackupReader, manifest: BackupManifest): Promise<BackupTables> {
  const tables = emptyTables()
  for (const part of manifest.parts) await readPart(reader, part, tables)
  const found = emptyCounts()
  for (const table of EXPORT_TABLES) found[table] = tables[table].length
  for (const table of EXPORT_TABLES) {
    if (found[table] !== manifest.tables[table]) {
      throw new BackupFormatError(`${table}: the manifest records ${manifest.tables[table]} rows and the parts hold ${found[table]}`)
    }
  }
  return tables
}

function isDataset(value: unknown): value is ExpenseDataset {
  const dataset = value as Record<string, unknown> | null
  return (
    dataset !== null &&
    typeof dataset === 'object' &&
    EXPORT_TABLES.every((table) => (table === 'settings' ? typeof dataset[table] === 'object' : Array.isArray(dataset[table])))
  )
}

/**
 * The rows of `owner`'s backup for `dateKey`. A chunked backup is read when it has a manifest, the single file
 * otherwise. Throws {@link BackupFormatError} for a backup that is not there, is unfinished, or does not add up.
 */
export async function readBackup(reader: BackupReader, owner: string, dateKey: string): Promise<ReadBackup> {
  const manifestText = await reader.get(manifestKey(owner, dateKey))
  if (manifestText !== null) {
    const manifest = parseBackupManifest(manifestText)
    return { kind: 'chunked', tables: await readChunked(reader, manifest), manifest }
  }
  const snapshotText = await reader.get(ownerBackupKey(owner, dateKey))
  if (snapshotText === null) {
    throw new BackupFormatError(`There is no finished backup of ${owner} for ${dateKey}`)
  }
  let dataset: unknown
  try {
    dataset = JSON.parse(snapshotText)
  } catch {
    throw new BackupFormatError(`The snapshot for ${dateKey} is not JSON`)
  }
  if (!isDataset(dataset)) throw new BackupFormatError(`The snapshot for ${dateKey} is not a dataset`)
  return { kind: 'snapshot', tables: tablesOfDataset(dataset) }
}
