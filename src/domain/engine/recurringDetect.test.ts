import { describe, expect, it } from 'vitest'
import { groupTransactions } from './recurringDetect'
import { makeTxn, monthlyDates } from './recurringTestHelpers'

describe('groupTransactions', () => {
  it('groups by normalized description, account, category, and type', () => {
    const txns = monthlyDates(2026, 1, 5, 4).map((date) =>
      makeTxn({ date, description: 'Netflix', accountId: 2 }),
    )
    const groups = groupTransactions(txns)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.dates).toHaveLength(4)
  })

  it('takes the amount and label of the newest occurrence whatever the row order', () => {
    const txns = [
      makeTxn({ date: '2026-03-05', description: 'Netflix', amountCents: 1_500 }),
      makeTxn({ date: '2026-01-05', description: 'netflix', amountCents: 1_000 }),
      makeTxn({ date: '2026-02-05', description: 'NETFLIX', amountCents: 1_200 }),
    ]
    const [group] = groupTransactions(txns)
    expect(group!.amountCents).toBe(1_500)
    expect(group!.label).toBe('Netflix')
  })

  it('excludes cancelled transactions', () => {
    const txns = monthlyDates(2026, 1, 5, 4).map((date) =>
      makeTxn({ date, description: 'Netflix', cancelled: true }),
    )
    expect(groupTransactions(txns)).toHaveLength(0)
  })

  it('requires minimum 3 occurrences', () => {
    const txns = [
      makeTxn({ date: '2026-01-05', description: 'Rare' }),
      makeTxn({ date: '2026-02-05', description: 'Rare' }),
    ]
    expect(groupTransactions(txns)).toHaveLength(0)
  })

  it('separates different accounts', () => {
    const txns = [
      ...monthlyDates(2026, 1, 5, 3).map((d) => makeTxn({ date: d, description: 'X', accountId: 1 })),
      ...monthlyDates(2026, 1, 5, 3).map((d) => makeTxn({ date: d, description: 'X', accountId: 2 })),
    ]
    expect(groupTransactions(txns)).toHaveLength(2)
  })

  it('separates different categories', () => {
    const txns = [
      ...monthlyDates(2026, 1, 5, 3).map((d) =>
        makeTxn({ date: d, description: 'Glovo', categoryId: 7, amountCents: 799 }),
      ),
      ...monthlyDates(2026, 2, 10, 3).map((d) =>
        makeTxn({ date: d, description: 'Glovo', categoryId: 3, amountCents: 1500 }),
      ),
    ]
    expect(groupTransactions(txns)).toHaveLength(2)
  })

  it('excludes installment-plan payments (they are a declared schedule)', () => {
    const txns = monthlyDates(2026, 1, 5, 4).map((date) =>
      makeTxn({ date, description: 'Iphone, Cetelam', planId: 9 }),
    )
    expect(groupTransactions(txns)).toHaveLength(0)
  })

  it('lists dates and offsets oldest to newest whatever order the rows arrive in', () => {
    const rows = [
      makeTxn({ id: 3, date: '2026-03-05', description: 'Gym', budgetMonth: '2026-04' }),
      makeTxn({ id: 1, date: '2026-01-05', description: 'Gym', budgetMonth: '2026-01' }),
      makeTxn({ id: 2, date: '2026-02-05', description: 'Gym', budgetMonth: '2026-02' }),
    ]
    const [group] = groupTransactions(rows)
    expect(group!.dates).toEqual(['2026-01-05', '2026-02-05', '2026-03-05'])
    expect(group!.budgetOffsets).toEqual([0, 0, 1])
    expect(groupTransactions([...rows].reverse())).toEqual(groupTransactions(rows))
  })

  it('lets the row added last speak for two rows on the same day, whatever order they arrive in', () => {
    const rows = [
      makeTxn({ id: 1, date: '2026-01-05', description: 'Gym', amountCents: 1_000 }),
      makeTxn({ id: 2, date: '2026-02-05', description: 'Gym', amountCents: 1_000 }),
      makeTxn({ id: 3, date: '2026-03-05', description: 'Gym', amountCents: 1_100 }),
      makeTxn({ id: 4, date: '2026-03-05', description: 'Gym', amountCents: 9_900 }),
    ]
    expect(groupTransactions(rows)[0]!.amountCents).toBe(9_900)
    expect(groupTransactions([...rows].reverse())[0]!.amountCents).toBe(9_900)
  })

  it('skips a row with a blank description', () => {
    const rows = monthlyDates(2026, 1, 5, 4).map((date) => makeTxn({ date, description: '   ' }))
    expect(groupTransactions(rows)).toHaveLength(0)
  })

  it('lists the groups in the order they first appear in the rows, which the fixed-cost list breaks ties by', () => {
    const alpha = monthlyDates(2026, 1, 5, 3).map((date) => makeTxn({ date, description: 'Alpha' }))
    const beta = monthlyDates(2026, 3, 5, 3).map((date) => makeTxn({ date, description: 'Beta' }))
    const newestFirst = [...alpha, ...beta].sort((a, b) => b.date.localeCompare(a.date))
    expect(groupTransactions(newestFirst).map((g) => g.label)).toEqual(['Beta', 'Alpha'])
    expect(groupTransactions([...alpha, ...beta]).map((g) => g.label)).toEqual(['Alpha', 'Beta'])
  })
})
