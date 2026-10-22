import {
  EXPORT_CHUNK_ROWS,
  EXPORT_TABLES,
  isExportCursor,
  isExportTable,
  type ExportChunk,
  type ExportChunkRequest,
} from '../data/exportTables'
import type { ExpenseRepository } from '../ports/expenseRepository'
import { ValidationError } from './validationError'

/** What a request carries, still unchecked: query-string text, or nothing. */
export interface RawExportRequest {
  table?: string | undefined
  after?: string | undefined
  limit?: string | undefined
}

/** Throws a {@link ValidationError} for a table, cursor or limit the export cannot serve. */
export function parseExportRequest(raw: RawExportRequest): ExportChunkRequest {
  if (!isExportTable(raw.table)) {
    throw new ValidationError(`table must be one of ${EXPORT_TABLES.join(', ')}`)
  }
  const table = raw.table
  const bound = EXPORT_CHUNK_ROWS[table]
  if (raw.after !== undefined && !isExportCursor(table, raw.after)) {
    throw new ValidationError(`after is not a position in ${table}`)
  }
  const limit = raw.limit === undefined ? bound : /^\d{1,9}$/.test(raw.limit) ? Number(raw.limit) : Number.NaN
  if (!Number.isInteger(limit) || limit < 1 || limit > bound) {
    throw new ValidationError(`limit must be a whole number from 1 to ${bound} for ${table}`)
  }
  return { table, limit, ...(raw.after !== undefined ? { after: raw.after } : {}) }
}

/** One chunk of one table of the owner's ledger; see {@link ExpenseRepository.readExportChunk}. */
export async function readExport(
  repo: ExpenseRepository,
  owner: string,
  request: ExportChunkRequest,
): Promise<ExportChunk> {
  return repo.readExportChunk(owner, request)
}
