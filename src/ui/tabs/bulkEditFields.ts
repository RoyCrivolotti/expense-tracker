import type { TxnType } from '../../types'
import type { BulkTransactionPatch } from '../../data/dataSource'

/**
 * Each bulk-editable field is a checkbox plus a value: unchecked means "leave
 * this alone", which is why the value is kept even while disabled. Split out of
 * the sheet so the mapping is unit-testable and the component stays layout.
 */
export interface BulkEditFieldState {
  categoryEnabled: boolean
  categoryId: number
  accountEnabled: boolean
  accountId: number
  typeEnabled: boolean
  type: TxnType
  dateEnabled: boolean
  date: string
  budgetMonthEnabled: boolean
  budgetMonth: string
  flagEnabled: boolean
  /** null means "clear the flag" — a real choice, not an empty state. */
  flagId: number | null
  labelsEnabled: boolean
  /** Labels to add, never to remove — see buildBulkLabelAdditions. */
  labelIds: number[]
}

export function anyFieldEnabled(fields: BulkEditFieldState): boolean {
  return (
    fields.categoryEnabled ||
    fields.accountEnabled ||
    fields.typeEnabled ||
    fields.dateEnabled ||
    fields.budgetMonthEnabled ||
    fields.flagEnabled ||
    fields.labelsEnabled
  )
}

export function buildBulkPatch(fields: BulkEditFieldState): BulkTransactionPatch {
  const patch: BulkTransactionPatch = {}
  if (fields.categoryEnabled) patch.categoryId = fields.categoryId
  if (fields.accountEnabled) patch.accountId = fields.accountId
  if (fields.typeEnabled) patch.type = fields.type
  if (fields.dateEnabled) patch.date = fields.date
  if (fields.budgetMonthEnabled) patch.budgetMonth = fields.budgetMonth
  if (fields.flagEnabled) patch.flagId = fields.flagId
  return patch
}

/**
 * Labels have no bulk column to patch (a transaction's label set is replaced
 * through its own endpoint, one transaction at a time — see setTransactionLabels),
 * and unlike every other field here, "apply to many" can't mean "replace": the
 * rows in one bulk edit can each already carry a different set, and labels are
 * only ever removed by hand everywhere else in the app. So this returns labels
 * to add, for the caller to union onto each row's own existing set — never a
 * replacement list.
 */
export function buildBulkLabelAdditions(fields: BulkEditFieldState): number[] {
  return fields.labelsEnabled ? fields.labelIds : []
}
