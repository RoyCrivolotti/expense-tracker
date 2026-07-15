/**
 * Cash reconciliation — mirrors the workbook's Cash Reconciliation sheet.
 *
 * Per budget month we surface income, debit (immediate) spend, each deferred
 * card's statement, and investments. Cash only leaves for a card statement once
 * that month is marked paid (the deferred cards are settled ~12th–15th), so:
 *
 *   cash movement = income − debit − Σ(paid card statements) − investments
 *   expected cash = opening cash + Σ cash movements so far
 *   gap           = actual cash (counted after paying cards) − expected cash
 *
 * The gap is the whole point of the view: a non-zero gap flags an un-entered or
 * mistaken transaction. Unpaid liability is the charge still sitting on a
 * not-yet-paid card statement.
 */
import type { Account, CashActual, ExpenseSettings, Transaction, TxnStatus } from '../types'
import { sortedMonths } from './dates'

/** A single deferred-card statement within a budget month. */
export interface CardCharge {
  chargeCents: number
  paid: boolean
}

export interface CashRow {
  month: string
  incomeCents: number
  debitExpenseCents: number
  /** Per deferred-account statement charge, keyed by account id. */
  cardCharges: Map<number, CardCharge>
  investmentsCents: number
  cashMovementCents: number
  expectedCashCents: number
  /** Manually recorded real cash, or null when not yet entered. */
  actualCashCents: number | null
  /** actual − expected, or null when no actual is recorded. */
  gapCents: number | null
  /** Prior month's gapCents, or null for the first row. */
  carryoverGapCents: number | null
  /** gapCents − carryoverGapCents when both are defined. */
  monthGapCents: number | null
  unpaidLiabilityCents: number
}

interface MonthAgg {
  incomeCents: number
  debitExpenseCents: number
  investmentsCents: number
  cardCharges: Map<number, CardCharge>
}

function emptyAgg(): MonthAgg {
  return { incomeCents: 0, debitExpenseCents: 0, investmentsCents: 0, cardCharges: new Map() }
}

function addCardCharge(agg: MonthAgg, accountId: number, signed: number, status: TxnStatus): void {
  // All rows in a card-month share one derived status (the statement paid flag).
  const card = agg.cardCharges.get(accountId) ?? { chargeCents: 0, paid: status === 'posted' }
  card.chargeCents += signed
  card.paid = status === 'posted'
  agg.cardCharges.set(accountId, card)
}

/** Bucket non-cancelled transactions into per-budget-month aggregates. */
function aggregateMonths(transactions: Transaction[], accounts: Account[]): Map<string, MonthAgg> {
  const immediate = new Set(accounts.filter((a) => a.settlement === 'immediate').map((a) => a.id))
  const deferred = new Set(accounts.filter((a) => a.settlement === 'deferred').map((a) => a.id))
  const byMonth = new Map<string, MonthAgg>()

  for (const txn of transactions) {
    if (txn.status === 'cancelled') continue
    const agg = byMonth.get(txn.budgetMonth) ?? emptyAgg()
    byMonth.set(txn.budgetMonth, agg)
    if (txn.type === 'income') {
      agg.incomeCents += txn.amountCents
    } else if (txn.type === 'investment') {
      agg.investmentsCents += txn.amountCents
    } else {
      const signed = txn.type === 'refund' ? -txn.amountCents : txn.amountCents
      if (immediate.has(txn.accountId)) agg.debitExpenseCents += signed
      else if (deferred.has(txn.accountId)) addCardCharge(agg, txn.accountId, signed, txn.status)
    }
  }
  return byMonth
}

/** Per-month cash reconciliation rows with the running expected-cash balance. */
export function computeCashReconciliation(
  transactions: Transaction[],
  accounts: Account[],
  settings: ExpenseSettings,
  cashActuals: CashActual[],
): CashRow[] {
  const byMonth = aggregateMonths(transactions, accounts)
  const actualByMonth = new Map(cashActuals.map((c) => [c.yearMonth, c.actualCashCents]))
  const months = sortedMonths([...byMonth.keys(), ...actualByMonth.keys()])

  let cash = settings.openingCashCents
  let priorGap: number | null = null
  const rows: CashRow[] = []
  for (const month of months) {
    const agg = byMonth.get(month) ?? emptyAgg()
    let paidStatements = 0
    let unpaid = 0
    for (const card of agg.cardCharges.values()) {
      if (card.paid) paidStatements += card.chargeCents
      else unpaid += card.chargeCents
    }
    const cashMovement =
      agg.incomeCents - agg.debitExpenseCents - paidStatements - agg.investmentsCents
    cash += cashMovement
    const actual = actualByMonth.get(month) ?? null
    const gapCents = actual === null ? null : actual - cash
    const carryoverGapCents = priorGap
    const monthGapCents =
      gapCents !== null
        ? carryoverGapCents !== null
          ? gapCents - carryoverGapCents
          : gapCents
        : null
    if (gapCents !== null) priorGap = gapCents
    rows.push({
      month,
      incomeCents: agg.incomeCents,
      debitExpenseCents: agg.debitExpenseCents,
      cardCharges: agg.cardCharges,
      investmentsCents: agg.investmentsCents,
      cashMovementCents: cashMovement,
      expectedCashCents: cash,
      actualCashCents: actual,
      gapCents,
      carryoverGapCents,
      monthGapCents,
      unpaidLiabilityCents: unpaid,
    })
  }
  return rows
}
