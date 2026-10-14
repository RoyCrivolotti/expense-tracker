import type { Transaction } from '../types'
import { addDaysIso, daysBetween, defaultBudgetMonth, isDueSoon, monthsBetweenBudget, priorBudgetMonth } from './dates'
import {
  PREDICT_HISTORY,
  classifyFrequency,
  leadDays,
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

/** Also the identity of a description in the Spending group-by: trimmed, case-folded text. */
export function normalizeDesc(description: string): string {
  return description.trim().toLowerCase()
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

/** One recurring-detection identity per transaction; fixed-spend classification reuses it. */
export function occurrenceKey(txn: Transaction): string {
  return `${normalizeDesc(txn.description)}|${txn.accountId}|${txn.categoryId}|${txn.type}`
}

/** Months from a transaction's calendar month to its assigned budget month. */
function budgetOffset(txn: Transaction): number {
  return monthsBetweenBudget(txn.date.slice(0, 7), txn.budgetMonth)
}

export function groupTransactions(transactions: Transaction[]): OccurrenceGroup[] {
  const map = new Map<string, OccurrenceGroup>()
  const latestDate = new Map<string, string>()

  for (const txn of transactions) {
    if (txn.cancelled) continue
    if (!txn.description.trim()) continue
    // Installment-plan payments are a declared schedule, not a detected pattern.
    if (txn.planId != null) continue

    const key = occurrenceKey(txn)
    const existing = map.get(key)
    if (existing) {
      existing.dates.push(txn.date)
      existing.budgetMonths.add(txn.budgetMonth)
      existing.budgetOffsets.push(budgetOffset(txn))
      existing.categoryId = txn.categoryId
      // The group speaks for its newest occurrence, whatever order the rows arrive in.
      if (txn.date >= latestDate.get(key)!) {
        latestDate.set(key, txn.date)
        existing.amountCents = txn.amountCents
        existing.label = txn.description
      }
    } else {
      latestDate.set(key, txn.date)
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
        budgetOffsets: [budgetOffset(txn)],
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
  lead: number,
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
    leadDays: lead,
  }
}

/** Typical months from calendar month to budget month, from the group's newest occurrences. */
function canonicalMonthOffset(group: OccurrenceGroup): number {
  const newest = group.dates
    .map((date, i) => ({ date, offset: group.budgetOffsets[i]! }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-PREDICT_HISTORY)
  return newest.length === 0 ? 0 : Math.round(median(newest.map((p) => p.offset)))
}

function resolvePrediction(
  sorted: string[],
  frequency: RecurringFrequency,
  forMonth: string | undefined,
  monthOffset: number,
  rolloverDay: number | undefined,
): { predictedDate: string; predictedBM: string } | null {
  if (forMonth && frequency === 'monthly') {
    // Force viewed budget month; derive the calendar date from this group's own
    // date→budget-month offset so deferred-card charges (budget month equals the
    // calendar month) and normal rollover charges each land on their real day.
    return {
      predictedDate: predictDateInBudgetMonth(forMonth, sorted, monthOffset),
      predictedBM: forMonth,
    }
  }
  const predictedDate = predictNextDate(frequency, sorted)
  if (!predictedDate) return null
  const predictedBM = defaultBudgetMonth(predictedDate, rolloverDay)
  if (forMonth && predictedBM !== forMonth) return null
  return { predictedDate, predictedBM }
}

function trySuggestGroup(
  group: OccurrenceGroup,
  transactions: Transaction[],
  forMonth: string | undefined,
  priorMonth: string | null,
  priorPriorMonth: string | null,
  rolloverDay: number | undefined,
): RecurringSuggestion | null {
  if (priorMonth && !group.budgetMonths.has(priorMonth) && !group.budgetMonths.has(priorPriorMonth ?? ''))
    return null

  const sorted = [...group.dates].sort()
  const gaps = sorted.slice(1).map((d, i) => daysBetween(sorted[i]!, d))
  if (gaps.length === 0) return null

  const medianGap = median(gaps)
  const frequency = classifyFrequency(medianGap)
  if (!frequency) return null

  const regularity = regularityScore(gaps)
  if (regularity < MIN_REGULARITY) return null

  const monthOffset = canonicalMonthOffset(group)
  const prediction = resolvePrediction(sorted, frequency, forMonth, monthOffset, rolloverDay)
  if (!prediction) return null
  if (isAlreadyEntered(group.key, prediction.predictedBM, transactions)) return null

  // A charge logged from the start of this suggestion's window on is the one it is about, whichever
  // budget month it was booked to, and a series that skips a month would otherwise keep a card for it.
  const lead = leadDays(frequency, sorted)
  if (sorted[sorted.length - 1]! >= addDaysIso(prediction.predictedDate, -lead)) return null

  return buildSuggestion(
    group,
    frequency,
    Math.min(regularity, 1),
    prediction.predictedDate,
    prediction.predictedBM,
    lead,
  )
}

/** Detect recurring transactions from history. Returns unentered upcoming suggestions. */
export function detectRecurring(
  transactions: Transaction[],
  options?: DetectRecurringOptions,
): RecurringSuggestion[] {
  const forMonth = options?.forBudgetMonth
  const rolloverDay = options?.rolloverDay
  const priorMonth = forMonth ? priorBudgetMonth(forMonth) : null
  const priorPriorMonth = priorMonth ? priorBudgetMonth(priorMonth) : null
  const groups = groupTransactions(transactions)
  const suggestions: RecurringSuggestion[] = []

  for (const group of groups) {
    const suggestion = trySuggestGroup(group, transactions, forMonth, priorMonth, priorPriorMonth, rolloverDay)
    if (suggestion) suggestions.push(suggestion)
  }

  return suggestions.sort((a, b) => a.predictedDate.localeCompare(b.predictedDate))
}

/**
 * Days after its date that a charge for the month before the viewed one stays on the card. By
 * then nearly every real charge has been logged, so what is still missing is more likely a
 * series that stopped than an entry that was forgotten.
 */
export const PREVIOUS_MONTH_GRACE_DAYS = 7

/**
 * Suggestions for the viewed budget month and for the one before it. The view moves on at the
 * rollover, while a charge dated just before it may not have arrived yet, and it would drop out
 * of sight with the month it belongs to.
 */
export function detectUpcoming(
  transactions: Transaction[],
  options: DetectRecurringOptions & { forBudgetMonth: string },
): RecurringSuggestion[] {
  const previous = detectRecurring(transactions, {
    ...options,
    forBudgetMonth: priorBudgetMonth(options.forBudgetMonth),
  })
  return [...previous, ...detectRecurring(transactions, options)].sort((a, b) =>
    a.predictedDate.localeCompare(b.predictedDate),
  )
}

/**
 * Days after its date that a charge nobody has logged stays on the card. Charges are logged within
 * a day or two, so one still missing after 15 days is more likely a series that stopped than an
 * entry that was forgotten, and without a limit it would stay until its month was over.
 */
export const OVERDUE_EXPIRY_DAYS = 15

/**
 * Whether the card shows a suggestion on `today` while `month` is viewed: it is due within its
 * window or overdue, no more than 15 days overdue, and a charge for the month before is
 * overdue by no more than a week.
 */
export function isSuggestionDue(suggestion: RecurringSuggestion, today: string, month: string): boolean {
  if (!isDueSoon(suggestion.predictedDate, today, suggestion.leadDays)) return false
  const overdueDays = daysBetween(suggestion.predictedDate, today)
  if (overdueDays > OVERDUE_EXPIRY_DAYS) return false
  return suggestion.predictedBudgetMonth === month || overdueDays <= PREVIOUS_MONTH_GRACE_DAYS
}
