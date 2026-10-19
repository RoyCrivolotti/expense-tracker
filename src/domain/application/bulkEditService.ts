/**
 * Bulk edits on a filter. A request names its rows either by id (as the bulk edit always has) or as a
 * filter with the count and revision the user was shown. The filter is
 * checked by `validateTxnFilter`, the one the paged reads use, so a filter means the same rows here as
 * in the list it came from.
 */
import {
  MAX_FILTER_EDIT_ROWS,
  bulkTooManyMessage,
  type FilterTarget,
} from '../data/bulkEdit'
import type { BulkTransactionPatch } from '../data/dataSource'
import type { ExpenseRepository } from '../ports/expenseRepository'
import { validateTxnFilter } from './transactionQueryService'
import { validateBulkUpdatePatch } from './transactionService'
import { ValidationError } from './validationError'

export interface BulkFilterRequest extends FilterTarget {
  /** The owner's revision when the user saw the count; the write is refused if it has moved. */
  expectedRevision: string
}

export interface BulkFilterEdit extends BulkFilterRequest {
  patch: BulkTransactionPatch
}

const FILTER_KEYS = ['filter', 'expectedCount', 'expectedRevision']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/** Whether a body asks for the filter form. Anything else is read as the ids form, as it always was. */
export function isFilterBody(body: unknown): boolean {
  return isRecord(body) && 'filter' in body
}

function allowOnly(body: Record<string, unknown>, allowed: string[]): void {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      throw new ValidationError(
        key === 'ids' ? 'Give ids or a filter, not both' : `Unknown field "${key}" in a filter request`,
      )
    }
  }
}

function expectedCount(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ValidationError('expectedCount must be the number of transactions you were shown')
  }
  if ((value as number) > MAX_FILTER_EDIT_ROWS) throw new ValidationError(bulkTooManyMessage())
  return value as number
}

function expectedRevision(value: unknown): string {
  if (typeof value !== 'string' || value === '' || value.length > 100) {
    throw new ValidationError('expectedRevision must be the revision you were given')
  }
  return value
}

function parseFilterRequest(body: Record<string, unknown>): BulkFilterRequest {
  return {
    filter: validateTxnFilter(body.filter),
    expectedCount: expectedCount(body.expectedCount),
    expectedRevision: expectedRevision(body.expectedRevision),
  }
}

/** `{ filter, expectedCount, expectedRevision, patch }`; throws a {@link ValidationError} for anything else. */
export function parseBulkFilterEdit(body: unknown): BulkFilterEdit {
  if (!isRecord(body)) throw new ValidationError('A request body is required')
  allowOnly(body, [...FILTER_KEYS, 'patch'])
  return { ...parseFilterRequest(body), patch: validateBulkUpdatePatch(body.patch) }
}

export async function bulkUpdateTransactionsByFilter(
  repo: ExpenseRepository,
  owner: string,
  edit: BulkFilterEdit,
) {
  return repo.bulkUpdateTransactionsByFilter(
    owner,
    { filter: edit.filter, expectedCount: edit.expectedCount },
    edit.patch,
  )
}
