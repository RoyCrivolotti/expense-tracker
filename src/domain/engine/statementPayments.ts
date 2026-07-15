import type { Account, AccountStatement } from '../types'
import type { CashRow } from './cashReconciliation'

export interface StatementPaymentRow {
  kind: 'statement-payment'
  key: string
  date: string
  budgetMonth: string
  cardAccountId: number
  debitAccountId: number
  amountCents: number
  cardName: string
}

function resolveDebitAccountId(accounts: Account[], defaultAccountId: number | null): number | null {
  if (defaultAccountId != null) {
    const preferred = accounts.find((a) => a.id === defaultAccountId)
    if (preferred?.settlement === 'immediate') return preferred.id
  }
  const debit = accounts.find((a) => a.settlement === 'immediate' && a.active)
  return debit?.id ?? null
}

/** Synthetic debit rows for paid deferred-card statements. */
export function buildStatementPayments(
  statements: AccountStatement[],
  cashRows: CashRow[],
  accounts: Account[],
  defaultAccountId: number | null,
): StatementPaymentRow[] {
  const debitAccountId = resolveDebitAccountId(accounts, defaultAccountId)
  if (debitAccountId == null) return []

  const deferred = accounts.filter((a) => a.settlement === 'deferred')
  const byName = new Map(deferred.map((a) => [a.id, a.name]))
  const cashByMonth = new Map(cashRows.map((r) => [r.month, r]))
  const rows: StatementPaymentRow[] = []

  for (const stmt of statements) {
    if (!stmt.paid || !stmt.paidOn) continue
    const cash = cashByMonth.get(stmt.yearMonth)
    const charge = cash?.cardCharges.get(stmt.accountId)?.chargeCents ?? 0
    if (charge <= 0) continue
    const cardName = byName.get(stmt.accountId)
    if (!cardName) continue
    rows.push({
      kind: 'statement-payment',
      key: `${stmt.accountId}:${stmt.yearMonth}`,
      date: stmt.paidOn,
      budgetMonth: stmt.yearMonth,
      cardAccountId: stmt.accountId,
      debitAccountId,
      amountCents: charge,
      cardName,
    })
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key))
}
