import { describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../../types'
import type { TransactionListRow } from '../../engine'
import { createRowHeights, rowKey, rowShape } from './rowHeights'

function txnRow(id: number, labelIds?: number[]): TransactionListRow {
  const txn: Transaction = {
    id,
    date: '2026-07-15',
    budgetMonth: '2026-07',
    description: 'Coffee',
    accountId: 1,
    categoryId: 1,
    type: 'expense',
    amountCents: 350,
    cancelled: false,
    status: 'posted',
    ...(labelIds ? { labelIds } : {}),
  }
  return { kind: 'transaction', txn }
}

const statement: TransactionListRow = {
  kind: 'statement-payment',
  key: '2:2026-06',
  date: '2026-06-15',
  budgetMonth: '2026-06',
  cardAccountId: 2,
  debitAccountId: 1,
  amountCents: 137_345,
  cardName: 'Iberia Icon',
}

describe('rowShape and rowKey', () => {
  it('tells rows apart by what changes their height', () => {
    expect(rowShape(txnRow(1))).toBe(0)
    expect(rowShape(txnRow(1, []))).toBe(0)
    expect(rowShape(txnRow(1, [4]))).toBe(1)
    expect(rowShape(txnRow(1, [4, 5]))).toBe(2)
    expect(rowShape(txnRow(1, [4, 5, 6, 7, 8]))).toBe(3)
    expect(rowShape(statement)).toBe(9)
  })

  it('keys a transaction by its id and a statement by its own key, which cannot collide', () => {
    expect(rowKey(txnRow(42))).toBe('42')
    expect(rowKey(statement)).toBe('2:2026-06')
  })
})

describe('createRowHeights', () => {
  it('guesses until it has seen a row', () => {
    const heights = createRowHeights()
    expect(heights.height('1', 0)).toBe(62)
    expect(heights.header()).toBe(28)
    expect(heights.gap()).toBe(16)
  })

  it('guesses a row like those it has seen, once it has seen some', () => {
    const heights = createRowHeights()
    heights.record([
      { key: '1', shape: 0, height: 60 },
      { key: '2', shape: 0, height: 64 },
    ])
    expect(heights.height('3', 0)).toBe(62)
    expect(heights.height('1', 0)).toBe(60)
  })

  it('adds a line for a row with labels until it has seen one, and a plain row height for a statement', () => {
    const heights = createRowHeights()
    heights.record([{ key: '1', shape: 0, height: 50 }])
    expect(heights.height('2', 2)).toBe(72)
    expect(heights.height('3', 9)).toBe(50)
    heights.record([{ key: '2', shape: 2, height: 80 }])
    expect(heights.height('4', 2)).toBe(80)
    heights.record([{ key: '3', shape: 9, height: 90 }])
    expect(heights.height('5', 9)).toBe(90)
  })

  it('tells subscribers when a reading changes what it believes', () => {
    const heights = createRowHeights()
    const listener = vi.fn()
    heights.subscribe(listener)
    const before = heights.version()
    heights.record([{ key: '1', shape: 0, height: 70 }])
    expect(listener).toHaveBeenCalledTimes(1)
    expect(heights.version()).toBe(before + 1)
  })

  it('stays quiet for a reading that agrees with the guess, or with the last one', () => {
    const heights = createRowHeights()
    const listener = vi.fn()
    heights.subscribe(listener)
    heights.record([{ key: '1', shape: 0, height: 62.2 }])
    expect(listener).not.toHaveBeenCalled()
    heights.record([{ key: '1', shape: 0, height: 62.4 }])
    expect(listener).not.toHaveBeenCalled()
    expect(heights.height('1', 0)).toBe(62.2)
  })

  it('follows a row that changes size', () => {
    const heights = createRowHeights()
    const listener = vi.fn()
    heights.subscribe(listener)
    heights.record([{ key: '1', shape: 0, height: 62 }])
    heights.record([{ key: '1', shape: 0, height: 90 }])
    expect(listener).toHaveBeenCalledTimes(1)
    expect(heights.height('1', 0)).toBe(90)
    expect(heights.height('2', 0)).toBe(90)
  })

  it('ignores a reading from something with no layout', () => {
    const heights = createRowHeights()
    const listener = vi.fn()
    heights.subscribe(listener)
    heights.record([
      { key: '1', shape: 0, height: 0 },
      { key: '2', shape: 0, height: Number.NaN },
    ])
    expect(listener).not.toHaveBeenCalled()
    expect(heights.height('1', 0)).toBe(62)
  })

  it('stops telling a subscriber that has left', () => {
    const heights = createRowHeights()
    const listener = vi.fn()
    heights.subscribe(listener)()
    heights.record([{ key: '1', shape: 0, height: 99 }])
    expect(listener).not.toHaveBeenCalled()
  })

  it('starts a new store from what an old one learned about each shape, but not about any row', () => {
    const old = createRowHeights()
    old.record([
      { key: '1', shape: 0, height: 58 },
      { key: '2', shape: 2, height: 90 },
    ])
    old.setChrome(30, 12)
    const next = createRowHeights(old.seed())
    expect(next.height('1', 0)).toBe(58)
    expect(next.height('9', 2)).toBe(90)
    expect(next.height('3', 3)).toBe(80)
    expect([next.header(), next.gap()]).toEqual([30, 12])
    next.record([{ key: '1', shape: 0, height: 60 }])
    expect(next.height('5', 0)).toBe(60)
    expect(next.seed().means.get(2)).toBe(90)
  })

  it('takes the header height and the gap, and says so only when they move', () => {
    const heights = createRowHeights()
    const listener = vi.fn()
    heights.subscribe(listener)
    heights.setChrome(28.2, 16.1)
    expect(listener).not.toHaveBeenCalled()
    heights.setChrome(32, 16)
    expect(listener).toHaveBeenCalledTimes(1)
    expect([heights.header(), heights.gap()]).toEqual([32, 16])
    heights.setChrome(32, 24)
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
