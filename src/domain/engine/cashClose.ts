/**
 * Month close over the cash reconciliation rows: a status per month, the bridge
 * from income to expected cash, and the balances at cost. Counted cash never
 * lands exactly on the expected figure, so a tolerance band separates "counted,
 * fine" from drift worth chasing — a bare red number is never shown without the
 * bridge that explains it.
 */
import type { ExpenseSettings, Transaction } from '../types'
import type { CashRow } from './cashReconciliation'

/** Expected and counted differ by tens of euros on tens of thousands; under this, the month is square. */
export const CASH_DRIFT_TOLERANCE_CENTS = 500

export type MonthCloseStatus = 'counted' | 'drift' | 'ready' | 'waiting' | 'open'

/**
 * counted: cash entered and the month's new drift sits inside the tolerance.
 * drift:   cash entered, and this month added real drift to chase.
 * ready:   every statement is paid and the cash can be counted now.
 * waiting: a card statement is still unpaid, so counting would be meaningless.
 * open:    the month under way or a later one (when `openMonth` is given): it has not ended.
 */
export function monthCloseStatus(
  row: CashRow,
  toleranceCents: number = CASH_DRIFT_TOLERANCE_CENTS,
  openMonth?: string,
): MonthCloseStatus {
  if (row.actualCashCents !== null) {
    return Math.abs(row.monthGapCents ?? 0) <= toleranceCents ? 'counted' : 'drift'
  }
  if (openMonth !== undefined && row.month >= openMonth) return 'open'
  return row.unpaidLiabilityCents > 0 ? 'waiting' : 'ready'
}

/**
 * The newest month that can be counted now. The newest, not the oldest: months from
 * before the user began counting stay uncounted for good, and pointing at them would
 * make the prompt permanent. Shared by the Cash banner and the Overview signal so
 * the two always name the same month.
 */
export function readyToCountMonth(rows: CashRow[], openMonth?: string): string | null {
  const ready = [...rows].reverse().find((r) => monthCloseStatus(r, undefined, openMonth) === 'ready')
  return ready?.month ?? null
}

export interface BridgeSegment {
  key: string
  label: string
  cents: number
  kind: 'start' | 'in' | 'out' | 'result'
}

/** Negation that never yields -0, which test and display equality both trip over. */
function neg(cents: number): number {
  return -cents || 0
}

/** Opening cash + income − debit − paid statements − investments = expected cash. */
export function cashBridge(row: CashRow): BridgeSegment[] {
  let paidCards = 0
  for (const card of row.cardCharges.values()) if (card.paid) paidCards += card.chargeCents
  const opening = row.expectedCashCents - row.cashMovementCents
  return [
    { key: 'opening', label: 'Opening cash', cents: opening, kind: 'start' },
    { key: 'income', label: 'Income', cents: row.incomeCents, kind: 'in' },
    { key: 'debit', label: 'Debit spend', cents: neg(row.debitExpenseCents), kind: 'out' },
    { key: 'cards', label: 'Card statements paid', cents: neg(paidCards), kind: 'out' },
    { key: 'invested', label: 'Invested', cents: neg(row.investmentsCents), kind: 'out' },
    { key: 'expected', label: 'Expected cash', cents: row.expectedCashCents, kind: 'result' },
  ]
}

export interface BalancesAtCost {
  /** The month's counted cash when entered, else the expected balance. */
  cashCents: number
  /** Opening investment balance plus contributions through the month — cost, not market value. */
  investedAtCostCents: number
}

/** Both figures are cost; market value lives in Goals, from check-ins. */
export function balancesAtCost(
  rows: CashRow[],
  settings: ExpenseSettings,
  transactions: Transaction[],
  month: string,
): BalancesAtCost {
  const row = [...rows].reverse().find((r) => r.month <= month)
  let invested = settings.openingInvestmentCents
  for (const txn of transactions) {
    if (txn.type !== 'investment' || txn.status === 'cancelled') continue
    if (txn.budgetMonth <= month) invested += txn.amountCents
  }
  return {
    cashCents: row ? (row.actualCashCents ?? row.expectedCashCents) : settings.openingCashCents,
    investedAtCostCents: invested,
  }
}
