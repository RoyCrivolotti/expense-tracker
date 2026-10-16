import { describe, expect, it } from 'vitest'
import { syntheticLedger } from './syntheticLedger'

const SHAPE = { months: 40, perMonth: 30 }

describe('syntheticLedger', () => {
  it('gives the same ledger for the same seed and a different one for another', () => {
    expect(syntheticLedger(SHAPE)).toEqual(syntheticLedger(SHAPE))
    expect(syntheticLedger({ ...SHAPE, seed: 2 }).transactions).not.toEqual(
      syntheticLedger(SHAPE).transactions,
    )
  })

  it('holds at least the ordinary rows of every month, newest first by date then id', () => {
    const { transactions } = syntheticLedger(SHAPE)
    expect(transactions.length).toBeGreaterThanOrEqual(SHAPE.months * SHAPE.perMonth)
    transactions.slice(1).forEach((b, i) => {
      const a = transactions[i]
      expect(a && (a.date > b.date || (a.date === b.date && a.id > b.id))).toBe(true)
    })
  })

  it('has unique ids and every reference resolves', () => {
    const d = syntheticLedger(SHAPE)
    const ids = new Set(d.transactions.map((t) => t.id))
    expect(ids.size).toBe(d.transactions.length)
    const has = (list: { id: number }[]) => new Set(list.map((x) => x.id))
    const [accounts, categories, flags, labels, plans] = [
      has(d.accounts),
      has(d.categories),
      has(d.flags),
      has(d.labels),
      has(d.installmentPlans),
    ] as [Set<number>, Set<number>, Set<number>, Set<number>, Set<number>]
    for (const t of d.transactions) {
      expect(accounts.has(t.accountId)).toBe(true)
      expect(categories.has(t.categoryId)).toBe(true)
      if (t.flagId) expect(flags.has(t.flagId)).toBe(true)
      if (t.planId) expect(plans.has(t.planId)).toBe(true)
      if (t.settledBy) expect(ids.has(t.settledBy)).toBe(true)
      for (const l of t.labelIds ?? []) expect(labels.has(l)).toBe(true)
    }
    for (const a of d.attachments) expect(ids.has(a.transactionId)).toBe(true)
  })

  it('covers the cases the engines treat specially', () => {
    const { transactions } = syntheticLedger(SHAPE)
    const some = (f: (t: (typeof transactions)[number]) => boolean) => transactions.some(f)
    expect(some((t) => t.cancelled)).toBe(true)
    expect(some((t) => t.type === 'refund')).toBe(true)
    expect(some((t) => t.type === 'investment' && t.amountCents < 0)).toBe(true)
    expect(some((t) => t.status === 'forecast')).toBe(true)
    expect(some((t) => t.status === 'posted')).toBe(true)
    expect(some((t) => t.planId !== undefined)).toBe(true)
    expect(some((t) => t.flagId !== undefined)).toBe(true)
    expect(some((t) => (t.reportCount ?? 0) > 0)).toBe(true)
  })

  it('settles a claim with one refund that covers exactly the rows pointing at it', () => {
    const { transactions } = syntheticLedger(SHAPE)
    const byRefund = new Map<number, typeof transactions>()
    for (const t of transactions) {
      if (t.settledBy !== undefined) byRefund.set(t.settledBy, [...(byRefund.get(t.settledBy) ?? []), t])
    }
    expect(byRefund.size).toBeGreaterThan(0)
    for (const [refundId, covered] of byRefund) {
      const refund = transactions.find((t) => t.id === refundId)
      expect(refund?.reportCount).toBe(covered.length)
      expect(refund?.amountCents).toBe(covered.reduce((s, t) => s + t.amountCents, 0))
      expect(covered.every((t) => t.flagId === undefined)).toBe(true)
    }
  })

  it('has a yearly series with three occurrences once it spans three years', () => {
    const { transactions } = syntheticLedger({ months: 40, perMonth: 0 })
    expect(transactions.filter((t) => t.description === 'Car insurance')).toHaveLength(3)
  })

  it('stays small and valid for a single month', () => {
    const d = syntheticLedger({ months: 1, perMonth: 0 })
    expect(d.transactions.length).toBeGreaterThan(0)
    expect(new Set(d.transactions.map((t) => t.budgetMonth))).toEqual(new Set(['2026-09']))
  })
})
