/** The checks on a single-row edit: which fields it may touch and what may go in them. */
import type { NewTransaction } from '../data/dataSource'
import type { TxnType } from '../types'
import {
  assertAmountSign,
  requireAmountCents,
  requireBoundedDescription,
  requireBoundedNotes,
  requireBudgetMonth,
  requireDate,
  requirePositiveInt,
  VALID_TXN_TYPES,
} from './transactionValidation'
import { ValidationError } from './validationError'

/**
 * Every field the edit form actually sends. Deliberately *not* `BULK_PATCH_KEYS`:
 * that set is a much narrower list of bulk-editable columns, and reusing it here
 * would reject `description`, `amountCents`, `cancelled`, `notes` and the installment
 * link — i.e. every ordinary edit.
 *
 * `settledBy` is absent on purpose. It is a foreign key to another transaction, and
 * the only legitimate writer is the reimbursement flow via the bulk path, which
 * ownership-checks it. Excluding it here removes the single-PATCH attack surface
 * outright rather than policing it.
 */
const PATCH_KEYS = new Set<string>([
  'date',
  'budgetMonth',
  'description',
  'accountId',
  'categoryId',
  'type',
  'amountCents',
  'cancelled',
  'notes',
  'flagId',
  'planId',
  'installmentIndex',
])

/**
 * Values, not just names. `PATCH_KEYS` above says which columns an edit may touch;
 * these say what may go in them. Without this the single-row PATCH is the one write
 * path that reaches SQLite unchecked, while create and bulk-edit both validate per
 * field, so `amountCents: "lots"` or a date of `"yesterday"` was stored as given.
 */
const PATCH_FIELD_VALIDATORS: Record<
  string,
  (
    v: unknown,
    p: Record<string, unknown>,
  ) => void
> = {
  date: (
    v,
    p,
  ) => {
    p.date = requireDate(v)
  },
  budgetMonth: (
    v,
    p,
  ) => {
    p.budgetMonth = requireBudgetMonth(v)
  },
  description: (
    v,
    p,
  ) => {
    p.description = requireBoundedDescription(v)
  },
  accountId: (
    v,
    p,
  ) => {
    p.accountId = requirePositiveInt(v, 'accountId')
  },
  categoryId: (
    v,
    p,
  ) => {
    p.categoryId = requirePositiveInt(v, 'categoryId')
  },
  type: (
    v,
    p,
  ) => {
    if (!VALID_TXN_TYPES.has(v as string)) throw new ValidationError('Invalid transaction type')
    p.type = v
  },
  amountCents: (
    v,
    p,
  ) => {
    p.amountCents = requireAmountCents(v)
  },
  cancelled: (
    v,
    p,
  ) => {
    if (typeof v !== 'boolean') throw new ValidationError('cancelled must be true or false')
    p.cancelled = v
  },
  // Absent leaves the note alone; null and '' both clear it.
  notes: (
    v,
    p,
  ) => {
    p.notes = v == null ? null : requireBoundedNotes(v)
  },
  flagId: (
    v,
    p,
  ) => {
    p.flagId = v === null ? null : requirePositiveInt(v, 'flagId')
  },
  planId: (
    v,
    p,
  ) => {
    p.planId = v === null ? null : requirePositiveInt(v, 'planId')
  },
  installmentIndex: (
    v,
    p,
  ) => {
    p.installmentIndex = v === null ? null : requirePositiveInt(v, 'installmentIndex')
  },
}

export function validateTransactionPatch(raw: unknown): Partial<NewTransaction> {
  if (raw == null || typeof raw !== 'object') throw new ValidationError('patch is required')
  const obj = raw as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    if (!PATCH_KEYS.has(key)) throw new ValidationError(`Field "${key}" is not patchable`)
  }
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(obj)) {
    if (obj[key] !== undefined) PATCH_FIELD_VALIDATORS[key]!(obj[key], patch)
  }
  // With both fields in hand the sign can be judged here; with only one, the stored row
  // has the other, and the repository checks it before writing.
  if (typeof patch.amountCents === 'number' && typeof patch.type === 'string') {
    assertAmountSign(patch.amountCents, patch.type as TxnType)
  }
  return patch
}
