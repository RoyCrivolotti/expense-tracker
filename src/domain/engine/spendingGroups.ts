/**
 * The Spending view's ranked rows: net expense grouped by category, fixed vs
 * flexible, label, or description. A description row is the transaction's text,
 * trimmed and case-folded (recurring detection already treats that as an identity),
 * so "Netflix" and "netflix " are one row and "Netflix 03" is another; renaming
 * transactions in bulk is how variants are merged. A transaction with two labels counts
 * in both label rows, so label totals can exceed the month total.
 */
import type { Category, Label, Transaction } from '../types'
import {
  type AnalyticsBasis,
  type SameDaysCut,
  basisOptions,
  budgetMonthLength,
  sameDaysCut,
  signedExpense,
  withinCut,
} from './analyticsPeriod'
import { type FixedSpendClassifier, classifyFixedSpend } from './fixedFlexible'
import { normalizeDesc } from './recurringDetect'

export type SpendingGroupBy = 'category' | 'fixedFlexible' | 'label' | 'description'

export interface SpendingGroupRow {
  key: string
  name: string
  /** Label colour, when the grouping has one. */
  color?: string
  /** Net expense for the selected month (same-days clamped when open). */
  currentCents: number
  /** The committed-but-unpaid share of `currentCents`. */
  unpaidCents: number
  /** The category's monthly budget; null outside category mode or without one. */
  budgetCents: number | null
  /** Where an even pace sits today against that budget; null when budget is. */
  shouldBeTodayCents: number | null
  /** Net expense per month over the trailing window, oldest first. */
  spark: { month: string; cents: number }[]
  /** Mean of the three closed months before, same-days clamped; null without history. */
  avg3Cents: number | null
  txnCount: number
}

export interface SpendingGroupsArgs {
  transactions: Transaction[]
  categories: Category[]
  labels: Label[]
}

export interface SpendingGroupsOptions {
  months: string[]
  month: string
  basis: AnalyticsBasis
  today: string
  /** The budget month `today` falls in (rollover-aware); defaults to today's calendar month. */
  openMonth?: string
  /** The owner's budget rollover day; defaults to plain calendar months. */
  rolloverDay?: number
  groupBy: SpendingGroupBy
}

interface Membership {
  key: string
  name: string
  color?: string
}

/** Which rows a transaction belongs to under a grouping (labels: several; others: one). */
function membershipsOf(
  txn: Transaction,
  groupBy: SpendingGroupBy,
  args: SpendingGroupsArgs,
  classifier: FixedSpendClassifier,
): Membership[] {
  if (groupBy === 'category') {
    const cat = args.categories.find((c) => c.id === txn.categoryId)
    return [{ key: String(txn.categoryId), name: cat?.name ?? 'Uncategorised' }]
  }
  if (groupBy === 'fixedFlexible') {
    return classifier.isFixed(txn)
      ? [{ key: 'fixed', name: 'Fixed' }]
      : [{ key: 'flexible', name: 'Flexible' }]
  }
  if (groupBy === 'description') {
    const key = normalizeDesc(txn.description)
    return key ? [{ key, name: txn.description.trim() }] : []
  }
  const ids = txn.labelIds ?? []
  return ids.flatMap((id) => {
    const label = args.labels.find((l) => l.id === id)
    return label ? [{ key: String(id), name: label.name, color: label.color }] : []
  })
}

/** A matcher for one row, for the detail pane and the Transactions deep link. */
export function groupMatcher(
  groupBy: SpendingGroupBy,
  key: string,
  classifier: FixedSpendClassifier,
): (txn: Transaction) => boolean {
  if (groupBy === 'category') return (txn) => String(txn.categoryId) === key
  if (groupBy === 'fixedFlexible')
    return (txn) => (classifier.isFixed(txn) ? 'fixed' : 'flexible') === key
  if (groupBy === 'description') return (txn) => normalizeDesc(txn.description) === key
  return (txn) => (txn.labelIds ?? []).some((id) => String(id) === key)
}

interface GroupAgg extends Membership {
  byMonth: Map<string, number>
  currentCents: number
  unpaidCents: number
  txnCount: number
  avgWindow: Map<string, number>
}

function emptyAgg(member: Membership): GroupAgg {
  return {
    ...member,
    byMonth: new Map(),
    currentCents: 0,
    unpaidCents: 0,
    txnCount: 0,
    avgWindow: new Map(),
  }
}

interface CollectScope {
  month: string
  cut: SameDaysCut | null
  avgMonths: Set<string>
}

function addToGroup(agg: GroupAgg, txn: Transaction, signed: number, scope: CollectScope): void {
  const inDays = withinCut(txn.date, txn.budgetMonth, scope.cut)
  // The open month's spark point obeys the same-days clamp the row total does,
  // so a tapped row never shows two different numbers for the same month.
  if (txn.budgetMonth !== scope.month || inDays) {
    agg.byMonth.set(txn.budgetMonth, (agg.byMonth.get(txn.budgetMonth) ?? 0) + signed)
  }
  if (!inDays) return
  if (txn.budgetMonth === scope.month) {
    agg.currentCents += signed
    agg.txnCount += 1
    if (txn.status === 'forecast') agg.unpaidCents += signed
  }
  if (scope.avgMonths.has(txn.budgetMonth)) {
    agg.avgWindow.set(txn.budgetMonth, (agg.avgWindow.get(txn.budgetMonth) ?? 0) + signed)
  }
}

function collectGroups(
  args: SpendingGroupsArgs,
  opts: SpendingGroupsOptions,
  classifier: FixedSpendClassifier,
): Map<string, GroupAgg> {
  const { months, month, basis, today, openMonth, rolloverDay, groupBy } = opts
  const engineOpts = basisOptions(basis)
  const scope: CollectScope = {
    month,
    cut: sameDaysCut(month, today, openMonth, rolloverDay),
    avgMonths: new Set(months.filter((m) => m < month).slice(-3)),
  }
  const window = new Set(months.filter((m) => m <= month).slice(-12))
  const groups = new Map<string, GroupAgg>()

  for (const txn of args.transactions) {
    if (!window.has(txn.budgetMonth)) continue
    const signed = signedExpense(txn, engineOpts)
    if (signed === null) continue
    for (const member of membershipsOf(txn, groupBy, args, classifier)) {
      const agg = groups.get(member.key) ?? emptyAgg(member)
      groups.set(member.key, agg)
      addToGroup(agg, txn, signed, scope)
    }
  }
  return groups
}

function budgetFor(
  key: string,
  opts: SpendingGroupsOptions,
  args: SpendingGroupsArgs,
): { budgetCents: number | null; shouldBeTodayCents: number | null } {
  if (opts.groupBy !== 'category') return { budgetCents: null, shouldBeTodayCents: null }
  const cat = args.categories.find((c) => String(c.id) === key)
  if (!cat || cat.monthlyBudgetCents <= 0) return { budgetCents: null, shouldBeTodayCents: null }
  const cut = sameDaysCut(opts.month, opts.today, opts.openMonth, opts.rolloverDay)
  const frac = cut === null ? 1 : cut.elapsedDays / budgetMonthLength(opts.month, opts.rolloverDay)
  return {
    budgetCents: cat.monthlyBudgetCents,
    shouldBeTodayCents: Math.round(cat.monthlyBudgetCents * frac),
  }
}

export function computeSpendingGroups(
  args: SpendingGroupsArgs,
  opts: SpendingGroupsOptions,
): SpendingGroupRow[] {
  const classifier = classifyFixedSpend(args.transactions)
  const sparkMonths = opts.months.filter((m) => m <= opts.month).slice(-12)
  const avgCount = opts.months.filter((m) => m < opts.month).slice(-3).length
  const rows: SpendingGroupRow[] = []
  for (const agg of collectGroups(args, opts, classifier).values()) {
    const avgTotal = [...agg.avgWindow.values()].reduce((s, v) => s + v, 0)
    rows.push({
      key: agg.key,
      name: agg.name,
      ...(agg.color !== undefined ? { color: agg.color } : {}),
      currentCents: agg.currentCents,
      unpaidCents: Math.max(0, Math.min(agg.unpaidCents, agg.currentCents)),
      ...budgetFor(agg.key, opts, args),
      spark: sparkMonths.map((m) => ({ month: m, cents: agg.byMonth.get(m) ?? 0 })),
      avg3Cents: avgCount > 0 ? Math.round(avgTotal / avgCount) : null,
      txnCount: agg.txnCount,
    })
  }
  return rows.sort((a, b) => b.currentCents - a.currentCents)
}

export type SpendingSort = 'amount' | 'items'

/**
 * The rows ranked by what was spent (as `computeSpendingGroups` returns them), or by how
 * many transactions each holds, which is how "what do I buy most often" is answered: a
 * 1.200 € rent line outranks thirty coffees by amount and never by count. Ties fall back to
 * the amount.
 */
export function sortSpendingRows(rows: SpendingGroupRow[], by: SpendingSort): SpendingGroupRow[] {
  if (by === 'amount') return rows
  return [...rows].sort((a, b) => b.txnCount - a.txnCount || b.currentCents - a.currentCents)
}
