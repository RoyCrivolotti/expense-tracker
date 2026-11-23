import { describe, expect, it } from 'vitest'
import { groupTransactions } from '../engine/recurringDetect'
import { makeTxn, monthlyDates } from '../engine/recurringTestHelpers'
import type { Transaction } from '../types'
import { type AwaitedCharge, lookalikesOf } from './seriesLookalike'

let nextId = 1

function rows(
  description: string,
  dates: string[],
  overrides: Partial<Transaction> = {},
): Transaction[] {
  return dates.map((date) => makeTxn({ id: nextId++, date, description, amountCents: 1299, ...overrides }))
}

const charge = (
  predictedDate: string,
  over: Partial<AwaitedCharge> = {},
): AwaitedCharge => ({
  seriesKey: 'streaming plus|1|1|expense',
  type: 'expense',
  amountCents: 1299,
  predictedDate,
  ...over,
})

/** Streaming on the 10th since June, November's charge not logged under its name. Invented data. */
const streaming = () => rows('Streaming Plus', monthlyDates(2026, 6, 10, 5))

/** The lookalike offered for a charge, or undefined. */
function found(
  awaited: AwaitedCharge,
  logged: Transaction[],
) {
  return lookalikesOf([awaited], logged).get(awaited.seriesKey)
}

describe('lookalikesOf', () => {
  it('offers a row saved under another name, with the same amount near the usual date', () => {
    const saved = rows('PAYPROC*STREAM 01', ['2026-11-09'])
    expect(found(charge('2026-11-10'), [...streaming(), ...saved])).toEqual({
      transactionId: saved[0]!.id,
      description: 'PAYPROC*STREAM 01',
      date: '2026-11-09',
    })
  })

  it('wants the amount to the cent: one cent off either way, or ten percent off, is not it', () => {
    for (const amountCents of [1298, 1300, 1169, 1429]) {
      const saved = rows('PAYPROC*STREAM 01', ['2026-11-10'], { amountCents })
      expect(found(charge('2026-11-10'), [...streaming(), ...saved])).toBeUndefined()
    }
  })

  it('takes a row up to five days either side of the usual date, and not six', () => {
    for (const [date, offered] of [
      ['2026-11-05', true],
      ['2026-11-15', true],
      ['2026-11-04', false],
      ['2026-11-16', false],
    ] as const) {
      const saved = rows('PAYPROC*STREAM 01', [date])
      expect(found(charge('2026-11-10'), [...streaming(), ...saved]) !== undefined).toBe(offered)
    }
  })

  it('counts days across a month end and a short February', () => {
    const late = rows('PAYPROC*STREAM 01', ['2026-12-02'])
    expect(found(charge('2026-11-30'), late)?.date).toBe('2026-12-02')

    expect(found(charge('2027-02-28'), rows('PAYPROC*STREAM 01', ['2027-03-03']))?.date).toBe('2027-03-03')
    expect(found(charge('2027-02-28'), rows('PAYPROC*STREAM 01', ['2027-03-06']))).toBeUndefined()
  })

  it('offers a row on another account, since a payment saved from its push may carry the push’s account', () => {
    const saved = rows('PAYPROC*STREAM 01', ['2026-11-10'], { accountId: 2 })
    expect(found(charge('2026-11-10'), [...streaming(), ...saved])?.transactionId).toBe(saved[0]!.id)
  })

  it('never offers money moving the other way', () => {
    const refund = rows('PAYPROC*STREAM 01', ['2026-11-10'], { type: 'refund' })
    expect(found(charge('2026-11-10'), [...streaming(), ...refund])).toBeUndefined()

    const salary = charge('2026-11-10', { type: 'income', seriesKey: 'salary|1|1|income' })
    expect(found(salary, rows('PAYPROC*STREAM 01', ['2026-11-10']))).toBeUndefined()
    expect(found(salary, rows('Bonus', ['2026-11-10'], { type: 'income' }))).toBeDefined()
  })

  it('reads a withdrawal, an investment stored below zero, as money in', () => {
    const plan = charge('2026-11-20', { type: 'investment', amountCents: 40000, seriesKey: 'index|1|1|investment' })
    const out = rows('Broker', ['2026-11-20'], { type: 'investment', amountCents: 40000 })
    const back = rows('Broker', ['2026-11-20'], { type: 'investment', amountCents: -40000 })
    expect(found(plan, out)).toBeDefined()
    expect(found(plan, back)).toBeUndefined()
  })

  it('never offers the charge of another monthly series at the same price', () => {
    const cloud = rows('Cloud Box', [...monthlyDates(2026, 6, 11, 5), '2026-11-11'])
    expect(found(charge('2026-11-10'), [...streaming(), ...cloud])).toBeUndefined()
  })

  it('reads which rows are series from the whole history’s groups when it is given', () => {
    const history = rows('Cloud Box', monthlyDates(2026, 6, 11, 5))
    const window = [...rows('Cloud Box', ['2026-11-11'])]
    const groups = groupTransactions([...streaming(), ...history, ...window])

    // The window alone holds one Cloud Box row, which looks like a lookalike; the history says it is a series' charge.
    expect(lookalikesOf([charge('2026-11-10')], window).size).toBe(1)
    expect(lookalikesOf([charge('2026-11-10')], window, groups).size).toBe(0)
  })

  it('picks the nearest of several rows, and leaves out cancelled rows and installment payments', () => {
    const far = rows('PAYPROC*A', ['2026-11-06'])
    const near = rows('PAYPROC*B', ['2026-11-12'])
    const cancelled = rows('PAYPROC*C', ['2026-11-10'], { cancelled: true })
    const installment = rows('PAYPROC*D', ['2026-11-10'], { planId: 3 })
    expect(found(charge('2026-11-10'), [...far, ...near, ...cancelled, ...installment])?.description).toBe('PAYPROC*B')
  })

  it('offers a row that fits two charges at one price for neither, and a second row still for the one it fits', () => {
    const cloud = charge('2026-11-11', { seriesKey: 'cloud box|1|1|expense' })
    const saved = rows('PAYPROC*STREAM 01', ['2026-11-10'])
    expect(lookalikesOf([charge('2026-11-10'), cloud], saved).size).toBe(0)

    const later = rows('PAYPROC*CLOUD 02', ['2026-11-16'])
    const both = lookalikesOf([charge('2026-11-10'), cloud], [...saved, ...later])
    expect([...both.keys()]).toEqual(['cloud box|1|1|expense'])
    expect(both.get('cloud box|1|1|expense')?.description).toBe('PAYPROC*CLOUD 02')
  })

  it('answers each charge on its own', () => {
    const saved = rows('PAYPROC*STREAM 01', ['2026-11-10'])
    const found2 = lookalikesOf(
      [charge('2026-11-10'), charge('2026-11-25', { seriesKey: 'gym|1|1|expense', amountCents: 2500 })],
      [...streaming(), ...saved],
    )
    expect([...found2.keys()]).toEqual(['streaming plus|1|1|expense'])
  })
})
