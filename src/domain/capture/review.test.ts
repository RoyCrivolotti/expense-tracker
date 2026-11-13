import { describe, expect, it } from 'vitest'
import {
  MIN_SIGHTINGS,
  buildMerchantIndex,
  merchantHistory,
  merchantKey,
  nearMonthEdge,
  reviewReasons,
  type HistoryRow,
  type ReviewFacts,
} from './review'

const row = (over: Partial<HistoryRow> = {}): HistoryRow => ({
  id: 1,
  date: '2026-10-01',
  description: 'Cafe Example',
  type: 'expense',
  categoryId: 3,
  cancelled: false,
  ...over,
})

describe('merchantKey', () => {
  it('folds case and accents and drops the words that hold a digit', () => {
    expect(merchantKey('CAFÉ EXAMPLE 0042')).toBe('cafe example')
    expect(merchantKey('  Shop   No7 North ')).toBe('shop north')
  })

  it('is empty when nothing readable is left', () => {
    expect(merchantKey('0042 7')).toBe('')
    expect(merchantKey('')).toBe('')
  })
})

describe('merchantHistory', () => {
  it('counts typed expenses with the merchant name and takes the newest row category and spelling', () => {
    const rows = [
      row({ id: 1, date: '2026-09-01', description: 'cafe example', categoryId: 5 }),
      row({ id: 2, date: '2026-10-05', description: 'Cafe Example ', categoryId: 3 }),
      row({ id: 3, date: '2026-10-05', description: 'Café Example', categoryId: 4 }),
    ]

    expect(merchantHistory(buildMerchantIndex(rows), 'CAFE EXAMPLE 0042')).toEqual({ sightings: 3, label: 'Café Example', categoryId: 4 })
  })

  it('breaks a tie on the date by the higher id, whatever order the rows arrive in', () => {
    const a = row({ id: 7, categoryId: 1 })
    const b = row({ id: 9, categoryId: 2 })

    expect(merchantHistory(buildMerchantIndex([a, b]), 'Cafe Example').categoryId).toBe(2)
    expect(merchantHistory(buildMerchantIndex([b, a]), 'Cafe Example').categoryId).toBe(2)
  })

  it('ignores cancelled rows, other types, other merchants and a longer name', () => {
    const rows = [
      row({ cancelled: true }),
      row({ type: 'income' }),
      row({ description: 'Cafe Elsewhere' }),
      row({ description: 'Cafe Example Two' }),
    ]

    expect(merchantHistory(buildMerchantIndex(rows), 'CAFE EXAMPLE')).toEqual({ sightings: 0, label: null, categoryId: null })
  })

  it('knows nothing of a payment with no text', () => {
    expect(merchantHistory(buildMerchantIndex([row()]), null).sightings).toBe(0)
    expect(merchantHistory(buildMerchantIndex([row({ description: '12 34' })]), '12 34').sightings).toBe(0)
  })
})

describe('nearMonthEdge', () => {
  const at = (localDate: string, hour: number, arrivedMonth = localDate.slice(0, 7)) => nearMonthEdge({ localDate, hour, arrivedMonth })

  it('is true in the last hour of a month and the first hour of the next', () => {
    expect(at('2026-11-30', 23)).toBe(true)
    expect(at('2026-12-01', 0)).toBe(true)
    expect(at('2026-02-28', 23)).toBe(true)
    expect(at('2028-02-29', 23)).toBe(true)
  })

  it('is false for an ordinary time and for a month end earlier in the day', () => {
    expect(at('2026-11-30', 22)).toBe(false)
    expect(at('2026-12-01', 1)).toBe(false)
    expect(at('2026-11-15', 23)).toBe(false)
    expect(at('2026-02-28', 23)).toBe(true)
    expect(at('2028-02-28', 23)).toBe(false)
  })

  it('is true when the hour cannot be told, since the day then cannot be trusted', () => {
    expect(nearMonthEdge({ localDate: '2026-11-15', hour: null, arrivedMonth: '2026-11' })).toBe(true)
  })

  it('is true when the push reached the server in a later month than the payment', () => {
    expect(at('2026-11-30', 18, '2026-12')).toBe(true)
    expect(at('2026-11-30', 18, '2026-11')).toBe(false)
  })
})

const clean: ReviewFacts = {
  amountCents: 1250,
  currency: 'EUR',
  hasMerchant: true,
  categoryId: 3,
  accountId: 1,
  suggestedType: 'expense',
  sightings: MIN_SIGHTINGS,
  monthEdge: false,
  possibleMatch: false,
}

describe('reviewReasons', () => {
  it('is empty for a known merchant with nothing in doubt, which is the only case for one tap', () => {
    expect(reviewReasons(clean)).toEqual([])
  })

  it.each<[string, Partial<ReviewFacts>, string]>([
    ['no amount', { amountCents: null }, 'no-amount'],
    ['no merchant', { hasMerchant: false }, 'no-merchant'],
    ['no category', { categoryId: null }, 'no-category'],
    ['no account', { accountId: null }, 'no-account'],
    ['another currency', { currency: 'USD' }, 'foreign'],
    ['own money moved', { suggestedType: null }, 'own-money'],
    ['near month end', { monthEdge: true }, 'month-edge'],
    ['a possible match', { possibleMatch: true }, 'possible-match'],
    ['seen once', { sightings: MIN_SIGHTINGS - 1 }, 'new-merchant'],
  ])('asks for a look on %s', (_name, over, reason) => {
    expect(reviewReasons({ ...clean, ...over })).toContain(reason)
  })

  it('does not call a merchant new when there is no merchant to be new', () => {
    expect(reviewReasons({ ...clean, hasMerchant: false, sightings: 0 })).toEqual(['no-merchant'])
  })

  it('treats an unknown currency as euros, like the rest of the capture code', () => {
    expect(reviewReasons({ ...clean, currency: null })).toEqual([])
  })

  it('lists every reason, not only the first', () => {
    const reasons = reviewReasons({ ...clean, categoryId: null, monthEdge: true, possibleMatch: true })
    expect(reasons).toEqual(['no-category', 'month-edge', 'possible-match'])
  })
})
