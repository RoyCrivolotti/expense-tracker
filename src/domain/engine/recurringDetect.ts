import type { Transaction } from '../types'
import { defaultBudgetMonth, priorBudgetMonth } from './dates'
import {
  classifyFrequency,
  predictDateInBudgetMonth,
  predictNextDate,
  regularityScore,
} from './recurringPredict'
import type {
  DetectRecurringOptions,
  GroupKey,
  OccurrenceGroup,
  RecurringFrequency,
  RecurringSuggestion,
} from './recurringTypes'

const MIN_OCCURRENCES = 3
const MIN_REGULARITY = 0.6
const MS_PER_DAY = 86_400_000

function normalizeDesc(description: string): string {
  return description.trim().toLowerCase()
}

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

function groupKey(txn: Transaction): string {
  return `${normalizeDesc(txn.description)}|${txn.accountId}|${txn.categoryId}|${txn.type}`
}

export function groupTransactions(transactions: Transaction[]): OccurrenceGroup[] {
  const map = new Map<string, OccurrenceGroup>()

  for (const txn of transactions) {
    if (txn.cancelled) continue
    if (!txn.description.trim()) continue
    // Installment-plan payments are a declared schedule, not a detected pattern.
    if (txn.planId != null) continue

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
          categoryId: txn.categoryId,
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

function isAlreadyEntered(
  key: GroupKey,
  predictedBudgetMonth: string,
  transactions: Transaction[],
): boolean {
  return transactions.some(
    (txn) =>
      !txn.cancelled &&
      txn.budgetMonth === predictedBudgetMonth &&
      txn.accountId === key.accountId &&
      txn.categoryId === key.categoryId &&
      txn.type === key.type &&
      normalizeDesc(txn.description) === key.normalizedDesc,
  )
}

function buildSuggestion(
  group: OccurrenceGroup,
  frequency: RecurringFrequency,
  confidence: number,
  predictedDate: string,
  predictedBudgetMonth: string,
): RecurringSuggestion {
  return {
    description: group.label,
    type: group.key.type,
    accountId: group.key.accountId,
    categoryId: group.categoryId,
    amountCents: group.amountCents,
    predictedDate,
    predictedBudgetMonth,
    frequency,
    confidence,
    occurrences: group.dates.length,
  }
}

function resolvePrediction(
  sorted: string[],
  frequency: RecurringFrequency,
  forMonth: string | undefined,
): { predictedDate: string; predictedBM: string } | null {
  if (forMonth && frequency === 'monthly') {
    // Force viewed budget month — avoids rollover shifting BM away from forMonth.
    return { predictedDate: predictDateInBudgetMonth(forMonth, sorted), predictedBM: forMonth }
  }
  const predictedDate = predictNextDate(frequency, sorted)
  if (!predictedDate) return null
  const predictedBM = defaultBudgetMonth(predictedDate)
  if (forMonth && predictedBM !== forMonth) return null
  return { predictedDate, predictedBM }
}

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

  const prediction = resolvePrediction(sorted, frequency, forMonth)
  if (!prediction) return null
  if (isAlreadyEntered(group.key, prediction.predictedBM, transactions)) return null

  return buildSuggestion(
    group,
    frequency,
    Math.min(regularity, 1),
    prediction.predictedDate,
    prediction.predictedBM,
  )
}

/** Detect recurring transactions from history. Returns unentered upcoming suggestions. */
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
