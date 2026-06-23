/**
 * Recurring transaction detection. Groups historical transactions by
 * (description, account, type), detects periodicity, and predicts upcoming
 * occurrences for user confirmation. Runs entirely in-memory from the loaded
 * dataset — same pattern as descriptionIndex.
 */

import type { Transaction, TxnType } from '../types'
import { defaultBudgetMonth, priorBudgetMonth } from './dates'

function normalizeDesc(description: string): string {
  return description.trim().toLowerCase()
}

export type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface RecurringSuggestion {
  description: string
  type: TxnType
  accountId: number
  categoryId: number
  amountCents: number
  predictedDate: string
  predictedBudgetMonth: string
  frequency: RecurringFrequency
  confidence: number
  occurrences: number
}

interface GroupKey {
  normalizedDesc: string
  accountId: number
  type: TxnType
}

interface OccurrenceGroup {
  key: GroupKey
  label: string
  categoryId: number
  amountCents: number
  dates: string[]
  budgetMonths: Set<string>
}

export interface DetectRecurringOptions {
  /** Scope suggestions to this budget month (requires prior-month activity). */
  forBudgetMonth?: string
}

const MIN_OCCURRENCES = 3
const DAY_TOLERANCE = 2
const MS_PER_DAY = 86_400_000

function toMs(iso: string): number {
  return new Date(iso).getTime()
}

function daysBetween(a: string, b: string): number {
  return Math.round((toMs(b) - toMs(a)) / MS_PER_DAY)
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

function dayOfMonth(iso: string): number {
  return Number(iso.split('-')[2])
}

function groupKey(txn: Transaction): string {
  return `${normalizeDesc(txn.description)}|${txn.accountId}|${txn.type}`
}

export function groupTransactions(transactions: Transaction[]): OccurrenceGroup[] {
  const map = new Map<string, OccurrenceGroup>()

  for (const txn of transactions) {
    if (txn.cancelled) continue
    if (!txn.description.trim()) continue

    const key = groupKey(txn)
    const existing = map.get(key)
    if (existing) {
      existing.dates.push(txn.date)
      existing.budgetMonths.add(txn.budgetMonth)
      existing.categoryId = txn.categoryId
      existing.amountCents = txn.amountCents
      existing.label = txn.description
    } else {
      map.set(key, {
        key: {
          normalizedDesc: normalizeDesc(txn.description),
          accountId: txn.accountId,
          type: txn.type,
        },
        label: txn.description,
        categoryId: txn.categoryId,
        amountCents: txn.amountCents,
        dates: [txn.date],
        budgetMonths: new Set([txn.budgetMonth]),
      })
    }
  }
  return [...map.values()].filter((g) => g.dates.length >= MIN_OCCURRENCES)
}

/** Classify a median gap (in days) into a frequency bucket, or null if irregular. */
export function classifyFrequency(medianGap: number): RecurringFrequency | null {
  if (medianGap >= 5 && medianGap <= 9) return 'weekly'
  if (medianGap >= 25 && medianGap <= 37) return 'monthly'
  if (medianGap >= 80 && medianGap <= 105) return 'quarterly'
  if (medianGap >= 340 && medianGap <= 395) return 'yearly'
  return null
}

/** Check regularity: what fraction of gaps fall within tolerance of the median. */
export function regularityScore(gaps: number[]): number {
  if (gaps.length === 0) return 0
  const med = median(gaps)
  const tolerance = Math.max(DAY_TOLERANCE, med * 0.15)
  const inRange = gaps.filter((g) => Math.abs(g - med) <= tolerance).length
  return inRange / gaps.length
}

/** Predict the next occurrence date based on frequency and historical days. */
export function predictNextDate(
  frequency: RecurringFrequency,
  sortedDates: string[],
): string | null {
  const last = sortedDates[sortedDates.length - 1]
  if (!last) return null

  if (frequency === 'weekly') {
    return addDaysIso(last, 7)
  }
  if (frequency === 'monthly') {
    const canonicalDay = Math.round(median(sortedDates.map(dayOfMonth)))
    return nextMonthOnDay(last, canonicalDay)
  }
  if (frequency === 'quarterly') {
    return addMonthsOnDay(last, 3, Math.round(median(sortedDates.map(dayOfMonth))))
  }
  // yearly
  return addMonthsOnDay(last, 12, Math.round(median(sortedDates.map(dayOfMonth))))
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function nextMonthOnDay(lastIso: string, day: number): string {
  const [y, m] = lastIso.split('-').map(Number) as [number, number]
  let nextMonth = m + 1
  let nextYear = y
  if (nextMonth > 12) {
    nextMonth = 1
    nextYear += 1
  }
  const maxDay = new Date(nextYear, nextMonth, 0).getDate()
  const clampedDay = Math.min(day, maxDay)
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
}

function addMonthsOnDay(lastIso: string, months: number, day: number): string {
  const [y, m] = lastIso.split('-').map(Number) as [number, number]
  let nextMonth = m + months
  let nextYear = y
  while (nextMonth > 12) {
    nextMonth -= 12
    nextYear += 1
  }
  const maxDay = new Date(nextYear, nextMonth, 0).getDate()
  const clampedDay = Math.min(day, maxDay)
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
}

function isAlreadyEntered(
  suggestion: { normalizedDesc: string; accountId: number; type: TxnType },
  predictedBudgetMonth: string,
  transactions: Transaction[],
): boolean {
  return transactions.some(
    (txn) =>
      !txn.cancelled &&
      txn.budgetMonth === predictedBudgetMonth &&
      txn.accountId === suggestion.accountId &&
      txn.type === suggestion.type &&
      normalizeDesc(txn.description) === suggestion.normalizedDesc,
  )
}

function buildSuggestion(
  group: OccurrenceGroup,
  frequency: RecurringFrequency,
  confidence: number,
  predictedDate: string,
): RecurringSuggestion {
  return {
    description: group.label,
    type: group.key.type,
    accountId: group.key.accountId,
    categoryId: group.categoryId,
    amountCents: group.amountCents,
    predictedDate,
    predictedBudgetMonth: defaultBudgetMonth(predictedDate),
    frequency,
    confidence,
    occurrences: group.dates.length,
  }
}

const MIN_REGULARITY = 0.6

function trySuggestGroup(
  group: OccurrenceGroup,
  transactions: Transaction[],
  forMonth: string | undefined,
  priorMonth: string | null,
): RecurringSuggestion | null {
  if (priorMonth && !group.budgetMonths.has(priorMonth)) return null

  const sorted = [...group.dates].sort()
  const gaps = sorted.slice(1).map((d, i) => daysBetween(sorted[i]!, d))
  if (gaps.length === 0) return null

  const medianGap = median(gaps)
  const frequency = classifyFrequency(medianGap)
  if (!frequency) return null

  const regularity = regularityScore(gaps)
  if (regularity < MIN_REGULARITY) return null

  const predictedDate = predictNextDate(frequency, sorted)
  if (!predictedDate) return null

  const predictedBM = defaultBudgetMonth(predictedDate)
  if (forMonth && predictedBM !== forMonth) return null
  if (isAlreadyEntered(group.key, predictedBM, transactions)) return null

  return buildSuggestion(group, frequency, Math.min(regularity, 1), predictedDate)
}

/**
 * Detect recurring transactions from history. Returns suggestions for
 * upcoming occurrences that haven't been entered yet.
 */
export function detectRecurring(
  transactions: Transaction[],
  options?: DetectRecurringOptions,
): RecurringSuggestion[] {
  const forMonth = options?.forBudgetMonth
  const priorMonth = forMonth ? priorBudgetMonth(forMonth) : null
  const groups = groupTransactions(transactions)
  const suggestions: RecurringSuggestion[] = []

  for (const group of groups) {
    const suggestion = trySuggestGroup(group, transactions, forMonth, priorMonth)
    if (suggestion) suggestions.push(suggestion)
  }

  return suggestions.sort((a, b) => a.predictedDate.localeCompare(b.predictedDate))
}
