/**
 * Parse transaction CSV exported by exportTransactionsCsv (comma-separated,
 * quoted fields). Resolves category and account names against the live dataset.
 */
import type { ExpenseDataset, TxnType } from '../types'
import type { NewTransaction } from './dataSource'
import { EXPORT_CSV_HEADER, EXPORT_CSV_TYPES } from './exportCsvFormat'

export { EXPORT_CSV_HEADER } from './exportCsvFormat'

export interface ParsedExportRow {
  input: NewTransaction
  line: number
}

export interface ParseExportError {
  line: number
  message: string
}

export interface ParseExportResult {
  rows: ParsedExportRow[]
  errors: ParseExportError[]
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') inQuotes = false
      else current += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') {
      fields.push(current)
      current = ''
    } else current += ch
  }
  fields.push(current)
  return fields
}

const VALID_TYPES = new Set<TxnType>(EXPORT_CSV_TYPES)

function resolveName<T extends { name: string; id: number }>(
  items: T[],
  name: string,
  label: string,
  line: number,
): { id: number } | ParseExportError {
  const match = items.find((i) => i.name === name)
  if (!match) return { line, message: `Unknown ${label}: ${name}` }
  return { id: match.id }
}

function parseAmount(raw: string | undefined, line: number): number | ParseExportError {
  const amountCents = Number(raw)
  if (!Number.isFinite(amountCents) || amountCents === 0) {
    return { line, message: 'Skipped zero or invalid amount' }
  }
  return amountCents
}

function parseType(raw: string | undefined, line: number): TxnType | ParseExportError {
  const type = (raw ?? '').toLowerCase() as TxnType
  if (!VALID_TYPES.has(type)) return { line, message: `Invalid type: ${raw}` }
  return type
}

function isParseError(value: unknown): value is ParseExportError {
  return typeof value === 'object' && value !== null && 'message' in value
}

function resolveRowRefs(
  fields: string[],
  line: number,
  dataset: ExpenseDataset,
): { categoryId: number; accountId: number; type: TxnType; amountCents: number } | ParseExportError {
  const [, , , , categoryName, accountName, typeRaw, amountRaw] = fields
  const amount = parseAmount(amountRaw, line)
  if (isParseError(amount)) return amount
  const category = resolveName(dataset.categories, categoryName ?? '', 'category', line)
  if ('message' in category) return category
  const account = resolveName(dataset.accounts, accountName ?? '', 'account', line)
  if ('message' in account) return account
  const type = parseType(typeRaw, line)
  if (isParseError(type)) return type
  return { categoryId: category.id, accountId: account.id, type, amountCents: amount }
}

function parseRow(
  fields: string[],
  line: number,
  dataset: ExpenseDataset,
): ParsedExportRow | ParseExportError {
  if (fields.length < 11) return { line, message: 'Expected 11 columns' }
  const [, date, budgetMonth, description] = fields
  const refs = resolveRowRefs(fields, line, dataset)
  if ('message' in refs) return refs
  if (!date || !budgetMonth) return { line, message: 'date and budget_month are required' }
  const notes = fields[10] || undefined
  return {
    line,
    input: {
      date,
      budgetMonth,
      description: description ?? '',
      categoryId: refs.categoryId,
      accountId: refs.accountId,
      type: refs.type,
      amountCents: refs.amountCents,
      cancelled: fields[9] === '1',
      ...(notes ? { notes } : {}),
    },
  }
}

/** Parse export-format CSV text into new-transaction inputs. */
export function parseExportCsv(text: string, dataset: ExpenseDataset): ParseExportResult {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length === 0) return { rows: [], errors: [] }
  const header = lines[0]?.trim()
  if (header !== EXPORT_CSV_HEADER) {
    return {
      rows: [],
      errors: [{ line: 1, message: `Expected header: ${EXPORT_CSV_HEADER}` }],
    }
  }
  const rows: ParsedExportRow[] = []
  const errors: ParseExportError[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim()
    if (!line) continue
    const parsed = parseRow(parseCsvLine(line), i + 1, dataset)
    if ('message' in parsed) errors.push(parsed)
    else rows.push(parsed)
  }
  return { rows, errors }
}
