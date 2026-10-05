/**
 * Signals: at most three rule-based findings computed from the month's numbers,
 * each pointing somewhere actionable. No model, no service — every signal is a
 * deterministic function of the inputs, so it can be tested like any other
 * number on the page. The engine returns structured facts; the UI writes the
 * sentences, because money and month formatting belong to the presentation.
 */
import type { CashRow } from './cashReconciliation'
import { readyToCountMonth } from './cashClose'
import type { Mover } from './movers'
import type { SpendingPace } from './spendingPace'

export const MAX_SIGNALS = 3

/** A mover below this baseline is noise, not news. */
const MOVER_MIN_BASELINE_CENTS = 4000
/** A mover inside ±30% of its average is normal variation. */
const MOVER_MIN_RATIO = 0.3
/** One grocery shop on day 1 extrapolates to a month of grocery shops; wait a few days. */
const PACE_MIN_DAY = 5

export type SignalTone = 'good' | 'warn' | 'info'

export type AnalyticsSignal =
  | {
      kind: 'pace'
      tone: SignalTone
      projectedCents: number
      flexibleBudgetCents: number
      dayOfMonth: number
      daysInMonth: number
    }
  | {
      kind: 'mover'
      tone: SignalTone
      categoryId: number
      name: string
      pct: number
      currentCents: number
      baselineCents: number
    }
  | { kind: 'cashReady'; tone: 'info'; month: string }

export interface SignalInputs {
  pace: SpendingPace
  movers: Mover[]
  cashRows: CashRow[]
  /** The budget month under way; months past it are never "ready to count". */
  openMonth?: string
}

function paceSignal(pace: SpendingPace): AnalyticsSignal | null {
  if (!pace.open || pace.flexibleBudgetCents <= 0) return null
  if (pace.dayOfMonth < PACE_MIN_DAY) return null
  return {
    kind: 'pace',
    tone: pace.projectedCents > pace.flexibleBudgetCents ? 'warn' : 'good',
    projectedCents: pace.projectedCents,
    flexibleBudgetCents: pace.flexibleBudgetCents,
    dayOfMonth: pace.dayOfMonth,
    daysInMonth: pace.daysInMonth,
  }
}

function moverSignal(movers: Mover[]): AnalyticsSignal | null {
  const candidate = movers.find(
    (m) =>
      m.baselineCents >= MOVER_MIN_BASELINE_CENTS &&
      Math.abs(m.deltaCents) / m.baselineCents >= MOVER_MIN_RATIO,
  )
  if (!candidate) return null
  return {
    kind: 'mover',
    tone: candidate.deltaCents > 0 ? 'warn' : 'good',
    categoryId: candidate.categoryId,
    name: candidate.name,
    pct: Math.round((Math.abs(candidate.deltaCents) / candidate.baselineCents) * 100),
    currentCents: candidate.currentCents,
    baselineCents: candidate.baselineCents,
  }
}

/** The newest month ready to count, the same one the Cash view's banner names. */
function cashSignal(cashRows: CashRow[], openMonth?: string): AnalyticsSignal | null {
  const month = readyToCountMonth(cashRows, openMonth)
  return month === null ? null : { kind: 'cashReady', tone: 'info', month }
}

export function computeSignals({ pace, movers, cashRows, openMonth }: SignalInputs): AnalyticsSignal[] {
  const signals = [paceSignal(pace), moverSignal(movers), cashSignal(cashRows, openMonth)]
  return signals.filter((s): s is AnalyticsSignal => s !== null).slice(0, MAX_SIGNALS)
}
