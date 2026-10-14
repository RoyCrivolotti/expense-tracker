import type { Transaction } from '../types'
import { defaultBudgetMonth, monthsBetweenBudget, priorBudgetMonth, shiftBudgetMonth } from './dates'
import {
  PREDICT_HISTORY,
  chooseRhythm,
  classifyFrequency,
  dateByInterval,
  leadDays,
  predictDateInBudgetMonth,
  predictNextDate,
  regularityScore,
  type Rhythm,
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
/** How many typical gaps past the newest occurrence an interval prediction looks for the viewed month. */
const INTERVAL_LOOKAHEAD = 3

/** Also the identity of a description in the Spending group-by: trimmed, case-folded text. */
export function normalizeDesc(description: string): string {
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

/** A group's newest occurrences with the months from each one's calendar month to its budget month. */
function newestOccurrences(group: OccurrenceGroup): { date: string; offset: number }[] {
  return group.dates
    .map((date, i) => ({ date, offset: group.budgetOffsets[i]! }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-PREDICT_HISTORY)
}

/** Typical months from calendar month to budget month, from the group's newest occurrences. */
function canonicalMonthOffset(group: OccurrenceGroup): number {
  const newest = newestOccurrences(group)
  return newest.length === 0 ? 0 : Math.round(median(newest.map((p) => p.offset)))
}

/**
 * Whether the newest occurrences were all booked to the budget month the rollover day gives their
 * date. A series that drifts through the calendar crosses the rollover day, so a fixed offset would
 * put some of its charges in the wrong month; the rollover rule follows the date instead.
 */
function followsRolloverRule(group: OccurrenceGroup, rolloverDay: number | undefined): boolean {
  return newestOccurrences(group).every(
    ({ date, offset }) =>
      offset === monthsBetweenBudget(date.slice(0, 7), defaultBudgetMonth(date, rolloverDay)),
  )
}

interface PredictionContext {
  forMonth: string | undefined
  monthOffset: number
  rolloverDay: number | undefined
  followsRule: boolean
}

/**
 * The next occurrence of a series that repeats a fixed number of days after the last, placed in
 * the viewed budget month. It always falls after the newest occurrence, so nothing it predicts
 * can already be entered; a month the series skips has no prediction.
 */
function resolveIntervalPrediction(
  sorted: string[],
  { forMonth, monthOffset, rolloverDay, followsRule }: PredictionContext,
): { predictedDate: string; predictedBM: string } | null {
  for (let step = 1; step <= INTERVAL_LOOKAHEAD; step++) {
    const predictedDate = dateByInterval(sorted, step)
    const predictedBM =
      forMonth && !followsRule
        ? shiftBudgetMonth(predictedDate.slice(0, 7), monthOffset)
        : defaultBudgetMonth(predictedDate, rolloverDay)
    if (!forMonth || predictedBM === forMonth) return { predictedDate, predictedBM }
  }
  return null
}

function resolvePrediction(
  sorted: string[],
  frequency: RecurringFrequency,
  rhythm: Rhythm,
  context: PredictionContext,
): { predictedDate: string; predictedBM: string } | null {
  const { forMonth, monthOffset, rolloverDay } = context
  if (frequency === 'monthly' && rhythm === 'interval') {
    return resolveIntervalPrediction(sorted, context)
  }
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

  const rhythm = frequency === 'monthly' ? chooseRhythm(sorted) : 'calendar'
  const prediction = resolvePrediction(sorted, frequency, rhythm, {
    forMonth,
    monthOffset: canonicalMonthOffset(group),
    rolloverDay,
    followsRule: followsRolloverRule(group, rolloverDay),
  })
  if (!prediction) return null
  if (rhythm === 'calendar' && isAlreadyEntered(group.key, prediction.predictedBM, transactions)) return null

  return buildSuggestion(
    group,
    frequency,
    Math.min(regularity, 1),
    prediction.predictedDate,
    prediction.predictedBM,
    leadDays(frequency, sorted, rhythm),
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
