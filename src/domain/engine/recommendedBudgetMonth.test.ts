import { describe, expect, it } from 'vitest'
import type { Account, AccountStatement, Transaction } from '../types'
import { makeTransaction } from '../../testing/factories'
import { recommendedBudgetMonth } from './status'

const accounts: Account[] = [
  { id: 1, name: 'Debit', kind: 'debit', settlement: 'immediate', active: true },
  { id: 2, name: 'Iberia', kind: 'credit', settlement: 'deferred', active: true },
  { id: 3, name: 'Santander', kind: 'credit', settlement: 'deferred', active: true },
]

const paid = (accountId: number, yearMonth: string): AccountStatement => ({ accountId, yearMonth, paid: true })

function txn(id: number, accountId: number, budgetMonth: string, extra: Partial<Transaction> = {}): Transaction {
  return makeTransaction({ id, accountId, budgetMonth, date: `${budgetMonth}-10`, ...extra })
}

// Today is 2026-10-28 with the rollover on the 30th: October is still the open month by date.
const TODAY = '2026-10-28'
const ROLLOVER = 30

function recommend(
  transactions: Transaction[],
  accountStatements: AccountStatement[],
  date = TODAY,
  rolloverDay = ROLLOVER,
) {
  return recommendedBudgetMonth(date, TODAY, rolloverDay, { accounts, transactions, accountStatements })
}

describe('recommendedBudgetMonth', () => {
  const october = [txn(1, 2, '2026-10'), txn(2, 3, '2026-10'), txn(3, 1, '2026-10')]
  const november = [txn(4, 2, '2026-11')]
  const bothPaid = [paid(2, '2026-10'), paid(3, '2026-10')]

  it('moves to the next month once every card is paid and the next month has rows', () => {
    expect(recommend([...october, ...november], bothPaid)).toBe('2026-11')
  })

  it('stays on the date month when a card that spent in it is unpaid', () => {
    expect(recommend([...october, ...november], [paid(2, '2026-10')])).toBe('2026-10')
  })

  it('stays when the next month has no rows yet', () => {
    expect(recommend(october, bothPaid)).toBe('2026-10')
  })

  it('does not count cancelled rows in either month', () => {
    const cancelledNext = [txn(4, 2, '2026-11', { cancelled: true })]
    expect(recommend([...october, ...cancelledNext], bothPaid)).toBe('2026-10')
    const cancelledCard = [txn(1, 2, '2026-10'), txn(2, 3, '2026-10', { cancelled: true }), ...november]
    expect(recommend(cancelledCard, [paid(2, '2026-10')])).toBe('2026-11')
  })

  it('ignores a card with no spending in the month', () => {
    const onlyIberia = [txn(1, 2, '2026-10'), ...november]
    expect(recommend(onlyIberia, [paid(2, '2026-10')])).toBe('2026-11')
  })

  it('stays when no card spent in the month, since nothing was settled', () => {
    expect(recommend([txn(1, 1, '2026-10'), ...november], [])).toBe('2026-10')
  })

  it('leaves a back-dated entry in its own month', () => {
    expect(recommend([...october, ...november], bothPaid, '2026-09-20')).toBe('2026-09')
  })

  it('keeps the normal next month for a date past the rollover day', () => {
    expect(recommend(october, [], '2026-10-30')).toBe('2026-11')
    expect(recommend([...october, ...november], [], '2026-10-30')).toBe('2026-11')
  })

  it('does not move on when the open month is already the next one', () => {
    // Past the rollover the open month is November; November is unpaid so it stays.
    const today = '2026-10-30'
    const result = recommendedBudgetMonth(today, today, ROLLOVER, {
      accounts,
      transactions: [...october, ...november],
      accountStatements: bothPaid,
    })
    expect(result).toBe('2026-11')
  })

  it('rolls December into January', () => {
    const today = '2026-12-28'
    const result = recommendedBudgetMonth(today, today, ROLLOVER, {
      accounts,
      transactions: [txn(1, 2, '2026-12'), txn(2, 2, '2027-01')],
      accountStatements: [paid(2, '2026-12')],
    })
    expect(result).toBe('2027-01')
  })

  it('does not read statements for other months', () => {
    expect(recommend([...october, ...november], [paid(2, '2026-11'), paid(3, '2026-11')])).toBe('2026-10')
  })
})
