/**
 * Bulk edits on a filter, and adding labels to many rows. A request names its rows either by id (as the
 * bulk edit always has) or as a filter with the count and revision the user was shown. The filter is
 * checked by `validateTxnFilter`, the one the paged reads use, so a filter means the same rows here as
 * in the list it came from.
 */
import {
  MAX_BULK_LABELS,
  MAX_BULK_LABEL_LINKS,
  MAX_FILTER_EDIT_ROWS,
  bulkTooManyLinksMessage,
  bulkTooManyMessage,
  type BulkTarget,
  type FilterTarget,
} from '../data/bulkEdit'
import type { BulkTransactionPatch } from '../data/dataSource'
import { parseDeleteTransactionIds } from '../data/transactionIds'
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

export interface BulkLabelRequest {
  /** Rows by id, or by filter with the revision the user saw. */
  target: BulkTarget
  expectedRevision?: string
  labelIds: number[]
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

function labelIds(raw: unknown): number[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new ValidationError('labelIds must name at least one label')
  if (raw.length > MAX_BULK_LABELS) {
    throw new ValidationError(`A request may name at most ${MAX_BULK_LABELS} labels`)
  }
  const ids = raw.map((value) => {
    if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new ValidationError('Invalid labelId')
    return value as number
  })
  return [...new Set(ids)]
}

/** `{ ids | filter…, labelIds }`. The count of rows times labels is bounded here for ids, by the repository for a filter. */
export function parseBulkLabelRequest(body: unknown): BulkLabelRequest {
  if (!isRecord(body)) throw new ValidationError('A request body is required')
  const labels = labelIds(body.labelIds)
  if (isFilterBody(body)) {
    allowOnly(body, [...FILTER_KEYS, 'labelIds'])
    const { expectedRevision: revision, ...target } = parseFilterRequest(body)
    return { target, expectedRevision: revision, labelIds: labels }
  }
  allowOnly(body, ['ids', 'labelIds'])
  const ids = parseDeleteTransactionIds(body.ids)
  if (ids.length * labels.length > MAX_BULK_LABEL_LINKS) throw new ValidationError(bulkTooManyLinksMessage())
  return { target: { ids }, labelIds: labels }
}

export async function addLabelsToTransactions(
  repo: ExpenseRepository,
  owner: string,
  request: BulkLabelRequest,
) {
  return repo.addLabelsToTransactions(owner, request.target, request.labelIds)
}
