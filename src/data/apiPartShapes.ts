/**
 * What each part must look like before the code after it reads it. A body from another version of the
 * server, or from something that is not the server, is told apart here and not by a crash further on.
 */

import type {
  CubePart,
  MonthRowsPart,
  ReferencePart,
  SeriesPart,
  TransactionPagePart,
  TransactionSummaryPart,
  UsagePart,
} from '../domain/data/ledgerParts'
import type { DescriptionSuggestResult } from '../domain/data/descriptionSuggest'
import type { TransactionAttachment } from '../domain/types'

const REFERENCE_TABLES = [
  'categories',
  'accounts',
  'flags',
  'labels',
  'accountStatements',
  'cashActuals',
  'installmentPlans',
  'goalScenarios',
  'wealthAccounts',
  'wealthCheckins',
] as const

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Just enough of each shape that the code after it cannot crash on a body from another version. */
export function isReferencePart(body: unknown): body is ReferencePart {
  if (!isObject(body) || typeof body.revision !== 'string') return false
  const { reference } = body
  return (
    isObject(reference) &&
    isObject(reference.settings) &&
    REFERENCE_TABLES.every((table) => Array.isArray(reference[table])) &&
    Array.isArray(body.pinned) &&
    Array.isArray(body.months) &&
    isObject(body.attachmentCounts) &&
    isObject(body.rowsPerMonth) &&
    typeof body.rowCount === 'number'
  )
}

export function isMonthRowsPart(body: unknown): body is MonthRowsPart {
  return (
    isObject(body) &&
    typeof body.revision === 'string' &&
    typeof body.from === 'string' &&
    typeof body.to === 'string' &&
    Array.isArray(body.transactions) &&
    isObject(body.attachmentCounts)
  )
}

export function isCubePart(body: unknown): body is CubePart {
  return (
    isObject(body) &&
    typeof body.revision === 'string' &&
    typeof body.from === 'string' &&
    typeof body.to === 'string' &&
    Array.isArray(body.cells)
  )
}

const isStrings = (list: unknown): boolean => Array.isArray(list) && list.every((item) => typeof item === 'string')
const isNumbers = (list: unknown): boolean => Array.isArray(list) && list.every((item) => typeof item === 'number')

/** A series as the detectors read it: text where they split text, numbers where they add them, and dates they can step back from. */
export function isSeriesPart(body: unknown): body is SeriesPart {
  return (
    isObject(body) &&
    typeof body.revision === 'string' &&
    Array.isArray(body.series) &&
    body.series.every(
      (s) =>
        isObject(s) &&
        typeof s.label === 'string' &&
        isStrings(s.newestDates) &&
        (s.newestDates as string[]).length > 0 &&
        isNumbers(s.olderGaps) &&
        isStrings(s.budgetMonths) &&
        isNumbers(s.budgetOffsets),
    )
  )
}

const USAGE_LISTS = ['categories', 'accounts', 'flags', 'labels'] as const

/** Every record of every kind with a count, which is all the Settings screens read of it. */
export function isUsagePart(body: unknown): body is UsagePart {
  return (
    isObject(body) &&
    typeof body.revision === 'string' &&
    USAGE_LISTS.every((kind) => {
      const list = body[kind]
      return (
        Array.isArray(list) &&
        list.every((record) => isObject(record) && typeof record.id === 'number' && typeof record.transactions === 'number')
      )
    })
  )
}

export function isSuggestResult(body: unknown): body is DescriptionSuggestResult {
  return (
    isObject(body) &&
    typeof body.tooBroad === 'boolean' &&
    Array.isArray(body.items) &&
    body.items.every(
      (match) =>
        isObject(match) &&
        typeof match.label === 'string' &&
        typeof match.date === 'string' &&
        typeof match.id === 'number' &&
        isObject(match.template),
    )
  )
}

export function isReceiptList(body: unknown): body is TransactionAttachment[] {
  return (
    Array.isArray(body) &&
    body.every((item) => isObject(item) && typeof item.id === 'number' && typeof item.transactionId === 'number')
  )
}

export function isTransactionPage(body: unknown): body is TransactionPagePart {
  return (
    isObject(body) &&
    (body.nextCursor === null || typeof body.nextCursor === 'string') &&
    Array.isArray(body.items) &&
    body.items.every((row) => isObject(row) && typeof row.id === 'number' && typeof row.date === 'string')
  )
}

export function isTransactionSummary(body: unknown): body is TransactionSummaryPart {
  return (
    isObject(body) &&
    typeof body.revision === 'string' &&
    typeof body.count === 'number' &&
    typeof body.capped === 'boolean' &&
    typeof body.netSpendCents === 'number'
  )
}
