import { describe, expect, it } from 'vitest'
import type { Account } from '../types'
import {
  computeBackfillUpdates,
  inferIberiaPaidOn,
  inferSantanderCreditPaidOn,
  inferStatementPaidOn,
} from './statementPaymentDates'

const iberia: Account = {
  id: 2,
  name: 'Iberia Icon',
  kind: 'credit',
  settlement: 'deferred',
  active: true,
}

const santanderCredit: Account = {
  id: 3,
  name: 'Santander Credit',
  kind: 'credit',
  settlement: 'deferred',
  active: true,
}

describe('inferIberiaPaidOn', () => {
  it('debits two days after the extract (~13th of the next month)', () => {
    expect(inferIberiaPaidOn('2026-05')).toBe('2026-06-15')
    expect(inferIberiaPaidOn('2026-06')).toBe('2026-07-15')
  })
})

describe('inferSantanderCreditPaidOn', () => {
  it('uses the 1st of the next calendar month', () => {
    expect(inferSantanderCreditPaidOn('2026-03')).toBe('2026-04-01')
    expect(inferSantanderCreditPaidOn('2026-05')).toBe('2026-06-01')
  })
})

describe('computeBackfillUpdates', () => {
  it('infers paidOn for paid deferred rows missing the column', () => {
    const updates = computeBackfillUpdates([
      { accountId: 2, yearMonth: '2026-06', paid: true, account: iberia },
      {
        accountId: 3,
        yearMonth: '2026-05',
        paid: true,
        paidOn: '2026-06-01',
        account: santanderCredit,
      },
    ])
    expect(updates).toEqual([{ accountId: 2, yearMonth: '2026-06', paidOn: '2026-07-15' }])
  })

  it('matches prod-shaped Jan–Jun fixtures', () => {
    const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
    const rows = months.flatMap((yearMonth) => [
      { accountId: 2, yearMonth, paid: true, account: iberia },
      { accountId: 3, yearMonth, paid: true, account: santanderCredit },
    ])
    const updates = computeBackfillUpdates(rows)
    expect(updates).toHaveLength(12)
    expect(inferStatementPaidOn(iberia, '2026-06')).toBe('2026-07-15')
    expect(inferStatementPaidOn(santanderCredit, '2026-05')).toBe('2026-06-01')
  })
})
