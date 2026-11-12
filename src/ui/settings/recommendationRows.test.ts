import { describe, expect, it } from 'vitest'
import type { RecommendationInfo } from '../../data/recommendationsApi'
import { makeTransaction } from '../../testing/factories'
import { entryFor, foreignAmountText, seedOf, warningsOf } from './recommendationRows'

const rec = (over: Partial<RecommendationInfo> = {}): RecommendationInfo => ({
  id: '0b0c0d0e-1111-4222-8333-444455556666',
  accountId: 1,
  amountCents: 1250,
  currency: 'EUR',
  localDate: '2026-11-10',
  occurredAt: '2026-11-10T09:41:07.000Z',
  merchantRaw: 'CAFE EXAMPLE',
  descriptionSuggested: 'Cafe',
  suggestedType: 'expense',
  ...over,
})

describe('seedOf', () => {
  it('carries everything the push gave, and the recommendation to settle', () => {
    expect(seedOf(rec())).toEqual({
      recommendationId: '0b0c0d0e-1111-4222-8333-444455556666',
      date: '2026-11-10',
      amountCents: 1250,
      accountId: 1,
      type: 'expense',
      description: 'Cafe',
    })
  })

  it('leaves out what the push could not give, so the form default stands', () => {
    const seed = seedOf(rec({ amountCents: null, accountId: null, suggestedType: null, descriptionSuggested: null }))

    expect(seed).toEqual({ recommendationId: '0b0c0d0e-1111-4222-8333-444455556666', date: '2026-11-10' })
  })
})

describe('a payment in another currency', () => {
  it('is not seeded into the euro form', () => {
    expect(seedOf(rec({ currency: 'USD' }))).not.toHaveProperty('amountCents')
  })

  it('reads in its own currency, and falls back to the bare code for one it cannot format', () => {
    expect(foreignAmountText(rec({ currency: 'USD' }))).toBe('US$12.50')
    expect(foreignAmountText(rec({ currency: 'ABCD' }))).toBe('12.50 ABCD')
  })
})

describe('warningsOf', () => {
  it('is empty for a complete euro payment', () => {
    expect(warningsOf(rec())).toEqual([])
  })

  it('names a missing amount, another currency and a missing type', () => {
    expect(warningsOf(rec({ amountCents: null, currency: 'USD', suggestedType: null }))).toEqual([
      'Incomplete',
      'In USD',
      'Pick a type',
    ])
  })

  it('does not call an unknown currency foreign', () => {
    expect(warningsOf(rec({ currency: null }))).toEqual([])
  })
})

describe('entryFor', () => {
  const typed = makeTransaction({ id: 5, accountId: 1, amountCents: 1250, date: '2026-11-11' })

  it('finds the one row with the same account and amount a day apart', () => {
    expect(entryFor(rec(), [typed])?.id).toBe(5)
  })

  it('ignores other accounts, amounts, dates and cancelled rows', () => {
    const others = [
      { ...typed, id: 6, accountId: 2 },
      { ...typed, id: 7, amountCents: 1251 },
      { ...typed, id: 8, date: '2026-11-12' },
      { ...typed, id: 9, cancelled: true },
    ]
    expect(entryFor(rec(), others)).toBeNull()
  })

  it('gives none when two rows fit, rather than choosing', () => {
    expect(entryFor(rec(), [typed, { ...typed, id: 6 }])).toBeNull()
  })

  it('gives none for a recommendation with no amount or account', () => {
    expect(entryFor(rec({ amountCents: null }), [typed])).toBeNull()
    expect(entryFor(rec({ accountId: null }), [typed])).toBeNull()
  })
})
