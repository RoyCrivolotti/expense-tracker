/**
 * Pure builder/validator for group-first batch entry: transactions are drafted
 * inside groups keyed by date + category, so the category is chosen once per
 * group and amortised across a run of amount/description entries rather than
 * being repeated per row (production) or carried forward invisibly (the
 * focused-card trial). Translates that draft state into the flat
 * `NewTransaction[]` the bulk-create endpoint expects. No I/O — the form
 * applies the result on save via `ExpenseActions.createTransactions`.
 */
import type { NewTransaction } from '../../data/dataSource'
import type { Category, TxnType } from '../../types'
import { defaultBudgetMonth } from '../../engine/dates'
import { parseMoneyToCents, type MoneyFormat } from '../../engine/money'

export interface GroupLineDraft {
  /** Client-only key for React list rendering and error lookup; not persisted. */
  id: string
  type: TxnType
  amount: string
  description: string
  categoryId: number
  accountId: number
}

export interface EntryGroupDraft {
  id: string
  date: string
  /** Default for new lines in this group — NOT a constraint on lines already
   * entered, which keep any value overridden through the line editor. */
  categoryId: number
  accountId: number
  type: TxnType
  /** Lines already committed with Enter or the add button. */
  lines: GroupLineDraft[]
  /** The entry strip. Lives on the group so returning to an earlier group
   * keeps whatever was half-typed there. */
  draft: GroupLineDraft
}

export type BuildGroupedResult =
  | { ok: true; transactions: NewTransaction[] }
  // lineId -> message; empty when nothing was entered anywhere (nothing to save).
  | { ok: false; errors: Record<string, string> }

export function isLineEmpty(line: GroupLineDraft): boolean {
  return line.description.trim() === '' && line.amount.trim() === ''
}

/**
 * The single source of truth for whether a line can be saved. Shared by the
 * builder and by the interactive commit path so the message a user sees when
 * pressing Enter can never drift from the one a failed save produces.
 */
export function lineError(line: GroupLineDraft, format: MoneyFormat): string | null {
  if (isLineEmpty(line)) return null
  if (Math.abs(parseMoneyToCents(line.amount, format)) <= 0) {
    return 'Enter an amount greater than zero'
  }
  return null
}

/**
 * Every line a group would contribute, the uncommitted strip included.
 * Saving has to cover the strip: someone who types a line and hits Save without
 * pressing Enter must not lose it silently.
 */
export function allLines(group: EntryGroupDraft): GroupLineDraft[] {
  return [...group.lines, group.draft]
}

/** Count and total of what would actually be written, using the same rule as the builder. */
export function groupTotals(
  groups: EntryGroupDraft[],
  format: MoneyFormat,
): { count: number; totalCents: number } {
  let count = 0
  let totalCents = 0
  for (const group of groups) {
    for (const line of allLines(group)) {
      if (isLineEmpty(line)) continue
      const cents = Math.abs(parseMoneyToCents(line.amount, format))
      if (cents <= 0) continue
      count += 1
      totalCents += cents
    }
  }
  return { count, totalCents }
}

/** Validate every non-empty line across all groups and flatten to NewTransaction[]. */
export function buildGroupedTransactions(
  groups: EntryGroupDraft[],
  format: MoneyFormat,
  budgetRolloverDay: number,
): BuildGroupedResult {
  const transactions: NewTransaction[] = []
  const errors: Record<string, string> = {}

  for (const group of groups) {
    // Derived per group rather than stored per line: the budget month follows
    // from the date, and making it an editable field is what pushed the
    // focused-card trial's date row off a 375px screen.
    const budgetMonth = defaultBudgetMonth(group.date, budgetRolloverDay)
    for (const line of allLines(group)) {
      if (isLineEmpty(line)) continue
      const message = lineError(line, format)
      if (message) {
        errors[line.id] = message
        continue
      }
      transactions.push({
        date: group.date,
        budgetMonth,
        description: line.description.trim(),
        accountId: line.accountId,
        categoryId: line.categoryId,
        type: line.type,
        amountCents: Math.abs(parseMoneyToCents(line.amount, format)),
        cancelled: false,
      })
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  if (transactions.length === 0) return { ok: false, errors: {} }
  return { ok: true, transactions }
}

type GroupDefaults = Partial<Pick<EntryGroupDraft, 'date' | 'categoryId' | 'accountId' | 'type'>>

/** Re-point one line at the group's new defaults, but only for fields it hadn't overridden. */
function retarget(line: GroupLineDraft, group: EntryGroupDraft, patch: GroupDefaults): GroupLineDraft {
  let next = line
  if (patch.categoryId !== undefined && line.categoryId === group.categoryId) {
    next = { ...next, categoryId: patch.categoryId }
  }
  if (patch.accountId !== undefined && line.accountId === group.accountId) {
    next = { ...next, accountId: patch.accountId }
  }
  if (patch.type !== undefined && line.type === group.type) {
    next = { ...next, type: patch.type }
  }
  return next
}

/**
 * Change a group's defaults, carrying the change into lines that were still
 * following the old default and leaving individually-overridden lines alone.
 *
 * Without the carry, changing a group's category would do nothing to the five
 * lines already entered under it, which turns "I filed this run under the wrong
 * category" into five expand-edit-collapse cycles. `date` is only ever a group
 * property, so it needs no per-line handling.
 */
export function applyGroupDefaults(group: EntryGroupDraft, patch: GroupDefaults): EntryGroupDraft {
  return {
    ...group,
    ...patch,
    lines: group.lines.map((line) => retarget(line, group, patch)),
    draft: retarget(group.draft, group, patch),
  }
}

/**
 * Defaults for a new group: same date and account/type as the last one, but the
 * first active category not already claimed on that date — the common case is a
 * second category on the same shopping day, and pre-picking it makes that a
 * zero-tap group. Falls back to the last group's category once every active
 * category on that date is taken.
 */
export function nextGroupSeed(
  groups: EntryGroupDraft[],
  categories: Category[],
): Pick<EntryGroupDraft, 'date' | 'categoryId' | 'accountId' | 'type'> | null {
  const last = groups[groups.length - 1]
  if (!last) return null
  const claimed = new Set(groups.filter((g) => g.date === last.date).map((g) => g.categoryId))
  const free = categories.find((c) => c.active && !claimed.has(c.id))
  return {
    date: last.date,
    categoryId: free?.id ?? last.categoryId,
    accountId: last.accountId,
    type: last.type,
  }
}
