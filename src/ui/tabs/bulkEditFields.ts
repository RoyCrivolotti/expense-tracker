import type { Transaction, TxnType } from '../../types'
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
  descriptionEnabled: boolean
  description: string
}

export function anyFieldEnabled(fields: BulkEditFieldState): boolean {
  return (
    fields.categoryEnabled ||
    fields.accountEnabled ||
    fields.typeEnabled ||
    fields.dateEnabled ||
    fields.budgetMonthEnabled ||
    fields.flagEnabled ||
    fields.labelsEnabled ||
    fields.descriptionEnabled
  )
}

/**
 * Apply needs something to send, and a rename needs a name: an enabled description
 * field that is blank (spaces count as blank) would overwrite every row with nothing.
 */
export function canApplyBulkEdit(fields: BulkEditFieldState): boolean {
  if (fields.descriptionEnabled && !fields.description.trim()) return false
  return anyFieldEnabled(fields)
}

export function buildBulkPatch(fields: BulkEditFieldState): BulkTransactionPatch {
  const patch: BulkTransactionPatch = {}
  if (fields.categoryEnabled) patch.categoryId = fields.categoryId
  if (fields.accountEnabled) patch.accountId = fields.accountId
  if (fields.typeEnabled) patch.type = fields.type
  if (fields.dateEnabled) patch.date = fields.date
  if (fields.budgetMonthEnabled) patch.budgetMonth = fields.budgetMonth
  if (fields.flagEnabled) patch.flagId = fields.flagId
  if (fields.descriptionEnabled) patch.description = fields.description.trim()
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

export interface DescriptionCount {
  description: string
  count: number
}

/**
 * The distinct descriptions a rename would overwrite, most common first. The
 * Transactions search matches description and notes as a substring, so a selection
 * made by searching can hold rows the owner did not mean to rename; this is how the
 * sheet shows what is about to be replaced.
 */
export function summarizeDescriptions(
  transactions: readonly Pick<Transaction, 'id' | 'description'>[],
  ids: ReadonlySet<number>,
): DescriptionCount[] {
  const counts = new Map<string, number>()
  for (const t of transactions) {
    if (!ids.has(t.id)) continue
    const description = t.description.trim()
    counts.set(description, (counts.get(description) ?? 0) + 1)
  }
  return [...counts]
    .map(([description, count]) => ({ description, count }))
    .sort((a, b) => b.count - a.count || a.description.localeCompare(b.description))
}

const SHOWN = 5

/**
 * What the sheet says a rename will overwrite. Capped, because a search on a short word
 * can catch dozens of spellings.
 */
export function replacedSummary(descriptions: readonly DescriptionCount[]): string {
  const shown = descriptions.slice(0, SHOWN).map((d) => `${d.description} (${d.count})`)
  const rest = descriptions.length - shown.length
  return `Replaces ${shown.join(', ')}${rest > 0 ? ` and ${rest} more` : ''}.`
}
