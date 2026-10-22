import {
  DEFAULT_PAGE_LIMIT,
  MAX_CASE_FOLDS,
  MAX_FILTER_LABELS,
  MAX_PAGE_LIMIT,
  MAX_QUERY_LENGTH,
  caseFolds,
  type TransactionSummary,
} from '../data/transactionQuery'
import { parseIsoDate } from '../engine/dates'
import type { TxnFilter } from '../engine/transactions'
import type { ExpenseRepository } from '../ports/expenseRepository'
import type { Transaction } from '../types'
import { decodeCursor, encodeCursor } from './transactionCursor'
import { ValidationError } from './validationError'

export interface TransactionListResult {
  items: Transaction[]
  /** Hand back as `cursor` for the next page; null when this was the last one. */
  nextCursor: string | null
}

export interface TransactionListRequest {
  /** Unvalidated, in the shape of {@link TxnFilter}. */
  filter: unknown
  limit?: unknown
  cursor?: unknown
}

type Parse = (value: unknown, key: string) => unknown

const TYPES = ['all', 'expense', 'income', 'investment', 'refund']
const STATUSES = ['all', 'posted', 'forecast', 'cancelled']

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

function positiveInt(value: unknown, key: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new ValidationError(`${key} must be a positive whole number`)
  }
  return value as number
}

function cents(value: unknown, key: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ValidationError(`${key} must be a whole number of cents, zero or more`)
  }
  return value as number
}

function month(value: unknown, key: string): string {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new ValidationError(`${key} must be YYYY-MM`)
  }
  return value
}

function date(value: unknown, key: string): string {
  if (typeof value !== 'string' || parseIsoDate(value) === null) {
    throw new ValidationError(`${key} must be a calendar date, YYYY-MM-DD`)
  }
  return value
}

const oneOf =
  (allowed: string[]): Parse =>
  (value, key) => {
    if (typeof value !== 'string' || !allowed.includes(value)) {
      throw new ValidationError(`${key} must be one of ${allowed.join(', ')}`)
    }
    return value
  }

function flagId(value: unknown, key: string): number | 'none' {
  return value === 'none' ? 'none' : positiveInt(value, key)
}

function labelIds(value: unknown, key: string): number[] {
  if (!Array.isArray(value)) throw new ValidationError(`${key} must be a list of label ids`)
  if (value.length > MAX_FILTER_LABELS) {
    throw new ValidationError(`${key} may name at most ${MAX_FILTER_LABELS} labels`)
  }
  return [...new Set(value.map((id) => positiveInt(id, key)))].sort((a, b) => a - b)
}

function query(value: unknown, key: string): string {
  if (typeof value !== 'string') throw new ValidationError(`${key} must be text`)
  if (value.length > MAX_QUERY_LENGTH) {
    throw new ValidationError(`${key} must be ${MAX_QUERY_LENGTH} characters or fewer`)
  }
  if (caseFolds(value.toLowerCase()).length > MAX_CASE_FOLDS) {
    throw new ValidationError(`${key} may hold at most ${MAX_CASE_FOLDS} different accented letters`)
  }
  return value
}

function amountRange(value: unknown, key: string): { fromCents: number; toCents: number } {
  if (!isPlainObject(value)) throw new ValidationError(`${key} must hold fromCents and toCents`)
  return {
    fromCents: cents(value.fromCents, `${key}.fromCents`),
    toCents: cents(value.toCents, `${key}.toCents`),
  }
}

const PARSERS: Record<keyof TxnFilter, Parse> = {
  month,
  dateFrom: date,
  dateTo: date,
  categoryId: positiveInt,
  accountId: positiveInt,
  type: oneOf(TYPES),
  status: oneOf(STATUSES),
  flagId,
  labelIds,
  query,
  amountMinCents: cents,
  amountMaxCents: cents,
  queryAmount: amountRange,
}

/**
 * The filter as the pure engine would read it, with each field checked and the ones that change
 * nothing left out ('all', no labels, a month beside a date range, an amount range with no text
 * to apply to). Two filters that select the same rows come out spelled the same way, which is
 * what lets a cursor be tied to one.
 */
function canonical(f: TxnFilter): TxnFilter {
  const dated = f.dateFrom !== undefined || f.dateTo !== undefined
  const fields: Array<[keyof TxnFilter, unknown, boolean]> = [
    ['month', f.month, !dated],
    ['dateFrom', f.dateFrom, true],
    ['dateTo', f.dateTo, true],
    ['categoryId', f.categoryId, true],
    ['accountId', f.accountId, true],
    ['type', f.type, f.type !== 'all'],
    ['status', f.status, f.status !== 'all'],
    ['flagId', f.flagId, true],
    ['labelIds', f.labelIds, (f.labelIds?.length ?? 0) > 0],
    ['query', f.query, f.query !== ''],
    ['amountMinCents', f.amountMinCents, true],
    ['amountMaxCents', f.amountMaxCents, true],
    ['queryAmount', f.queryAmount, f.query !== undefined && f.query !== ''],
  ]
  return Object.fromEntries(fields.filter(([, v, keep]) => v !== undefined && keep).map(([k, v]) => [k, v]))
}

/** Throws a {@link ValidationError} naming the first field that is not usable. */
export function validateTxnFilter(input: unknown): TxnFilter {
  if (input === undefined) return {}
  if (!isPlainObject(input)) throw new ValidationError('filter must be an object')
  const parsed: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    const parse = (PARSERS as Record<string, Parse | undefined>)[key]
    if (!parse) throw new ValidationError(`Unknown filter: ${key}`)
    if (value !== undefined) parsed[key] = parse(value, key)
  }
  return canonical(parsed)
}

function pageLimit(value: unknown): number {
  if (value === undefined) return DEFAULT_PAGE_LIMIT
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > MAX_PAGE_LIMIT) {
    throw new ValidationError(`limit must be a whole number from 1 to ${MAX_PAGE_LIMIT}`)
  }
  return value as number
}

/** One page of the owner's transactions, newest first, and the cursor for the one after it. */
export async function listTransactions(
  repo: Pick<ExpenseRepository, 'queryTransactions'>,
  owner: string,
  request: TransactionListRequest,
): Promise<TransactionListResult> {
  const filter = validateTxnFilter(request.filter)
  const limit = pageLimit(request.limit)
  const after = request.cursor === undefined ? undefined : await decodeCursor(request.cursor, filter)
  const page = await repo.queryTransactions(owner, filter, after ? { limit, after } : { limit })
  const last = page.items.at(-1)
  const nextCursor =
    page.hasMore && last ? await encodeCursor({ date: last.date, id: last.id }, filter) : null
  return { items: page.items, nextCursor }
}

/** How many rows match (counted up to a cap) and what they net to. */
export async function summarizeTransactions(
  repo: Pick<ExpenseRepository, 'summarizeTransactions'>,
  owner: string,
  filter: unknown,
): Promise<TransactionSummary> {
  return repo.summarizeTransactions(owner, validateTxnFilter(filter))
}
