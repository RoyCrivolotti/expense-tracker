import { describe, expect, it } from 'vitest'
import { makeTransaction } from '../testing/factories'
import { touchesSeries } from './touchesSeries'

const row = (over: Parameters<typeof makeTransaction>[0] = {}) => makeTransaction({ id: 1, description: 'Gym', ...over })

describe('touchesSeries', () => {
  const rows = [row({ id: 1 }), row({ id: 2, description: 'Rent' })]
  const edit = (id: number, over: Parameters<typeof makeTransaction>[0]) =>
    rows.map((r) => (r.id === id ? { ...r, ...over } : r))

  it.each([
    ['a flag put on a row', { flagId: 3 }],
    ['labels set on a row', { labelIds: [1, 2] }],
    ['a note', { notes: 'Paid at the desk' }],
    ['the settled payment of a row', { settledBy: 9 }],
    ['the derived status of a row', { status: 'forecast' as const }],
  ])('is false for %s', (_name, over) => {
    expect(touchesSeries(rows, edit(1, over))).toBe(false)
  })

  it.each([
    ['the description', { description: 'Gym membership' }],
    ['the date', { date: '2025-02-01' }],
    ['the budget month', { budgetMonth: '2025-02' }],
    ['the account', { accountId: 7 }],
    ['the category', { categoryId: 7 }],
    ['the type', { type: 'income' as const }],
    ['the amount', { amountCents: 1 }],
    ['the cancelled flag', { cancelled: true }],
    ['the plan the row pays', { planId: 5 }],
  ])('is true for an edit of %s', (_name, over) => {
    expect(touchesSeries(rows, edit(1, over))).toBe(true)
  })

  it('is true for a row that counts being added or removed, and for none else', () => {
    expect(touchesSeries(rows, [...rows, row({ id: 3 })])).toBe(true)
    expect(touchesSeries(rows, rows.slice(1))).toBe(true)
    expect(touchesSeries(rows, [...rows, row({ id: 3, cancelled: true })])).toBe(false)
    expect(touchesSeries(rows, [...rows, row({ id: 3, description: '   ' })])).toBe(false)
    expect(touchesSeries(rows, [...rows, row({ id: 3, planId: 2 })])).toBe(false)
    const withIdle = [...rows, row({ id: 3, cancelled: true })]
    expect(touchesSeries(withIdle, rows)).toBe(false)
  })

  it('is false for a row that does not count being edited, and true when the edit makes it count', () => {
    const cancelled = [row({ id: 1, cancelled: true })]
    expect(touchesSeries(cancelled, [{ ...cancelled[0]!, amountCents: 5, date: '2025-03-01' }])).toBe(false)
    expect(touchesSeries(cancelled, [{ ...cancelled[0]!, cancelled: false }])).toBe(true)
  })

  it('is false when nothing changed, however the rows are ordered', () => {
    expect(touchesSeries(rows, [...rows].reverse())).toBe(false)
    expect(touchesSeries([], [])).toBe(false)
  })
})
