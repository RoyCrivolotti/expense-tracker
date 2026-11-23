import { describe, expect, it, vi } from 'vitest'
import {
  MIN_SIGHTINGS,
  bankMerchantName,
  buildMerchantIndex,
  merchantHistory,
  merchantKey,
  reviewReasons,
  REVIEW_TEXT,
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

describe('bankMerchantName', () => {
  it('drops the words that hold a digit and keeps the bank spelling', () => {
    expect(bankMerchantName('CAFE EXAMPLE 0042')).toBe('CAFE EXAMPLE')
    expect(bankMerchantName('Shop No7 North')).toBe('Shop North')
  })

  it('keeps the bank text when every word holds a digit, and is empty for nothing', () => {
    expect(bankMerchantName('0042 7B')).toBe('0042 7B')
    expect(bankMerchantName('')).toBe('')
  })
})

const TODAY = '2026-11-14'
const history = (
  rows: HistoryRow[],
  bank = 'CAFE EXAMPLE 0042',
) => merchantHistory(buildMerchantIndex(rows, TODAY), bank)
const rows = (
  n: number,
  over: Partial<HistoryRow> = {},
  from = 100,
): HistoryRow[] => Array.from({ length: n }, (_, i) => row({ id: from + i, date: `2026-0${(i % 9) + 1}-10`, ...over }))

describe('merchantHistory', () => {
  it('counts typed expenses with the merchant name and reads the usual description and category', () => {
    const held = [
      row({ id: 1, date: '2026-09-01', description: 'cafe example', categoryId: 5 }),
      row({ id: 2, date: '2026-10-05', description: 'Cafe Example ', categoryId: 3 }),
      row({ id: 3, date: '2026-10-05', description: 'Café Example', categoryId: 3 }),
    ]

    expect(history(held)).toEqual({ sightings: 3, label: 'Café Example', categoryId: 3, settled: true })
  })

  it('prefers the usual description to a newer one-off', () => {
    // The merchant key drops words that hold a digit, so "Cafe Example 7" is this merchant under another description.
    const held = [
      ...rows(4, { description: 'Cafe Example' }),
      row({ id: 900, date: '2026-11-10', description: 'Cafe Example 7', categoryId: 9 }),
    ]

    expect(history(held, 'Cafe Example')).toMatchObject({ label: 'Cafe Example', categoryId: 3, settled: true })
  })

  it('lets a rename that has become the majority overtake the old name, and spells it as last typed', () => {
    const held = [
      ...rows(2, { description: 'Cafe Example', date: '2026-03-01' }),
      row({ id: 50, date: '2026-09-01', description: 'cafe example 9' }),
      row({ id: 51, date: '2026-10-01', description: 'CAFE EXAMPLE 9' }),
      row({ id: 52, date: '2026-11-01', description: 'Café Example 9' }),
    ]

    expect(history(held)).toMatchObject({ label: 'Café Example 9', settled: true })
  })

  it('does not count an old majority outside the window', () => {
    const held = [
      ...rows(5, { description: 'Cafe Example 8', date: '2025-06-01' }),
      row({ id: 60, date: '2026-09-01', description: 'Cafe Example' }),
      row({ id: 61, date: '2026-10-01', description: 'Cafe Example' }),
    ]

    expect(history(held, 'Cafe Example')).toMatchObject({ label: 'Cafe Example', sightings: 7, settled: true })
  })

  // Three rows of one description on `edge` against two recent rows of another: the three win only if `edge` is in the window.
  const winnerWith = (
    today: string,
    edge: string,
  ) => {
    const held = [
      ...[1, 2, 3].map((id) => row({ id, date: edge, description: 'Cafe Example 2' })),
      ...[4, 5].map((id) => row({ id, date: today, description: 'Cafe Example 1' })),
    ]
    return merchantHistory(buildMerchantIndex(held, today), 'Cafe Example').label
  }

  it('counts a row exactly one year back and not the day before', () => {
    expect(winnerWith('2027-01-14', '2026-01-14')).toBe('Cafe Example 2')
    expect(winnerWith('2027-01-14', '2026-01-13')).toBe('Cafe Example 1')
  })

  it('clamps the window start on a short month', () => {
    // A year before 29 Feb 2028 is 28 Feb 2027, since 2027 has no 29 Feb.
    expect(winnerWith('2028-02-29', '2027-02-28')).toBe('Cafe Example 2')
    expect(winnerWith('2028-02-29', '2027-02-27')).toBe('Cafe Example 1')
  })

  it('gives the tie to the more recent description, but never settles it', () => {
    const held = [
      row({ id: 1, date: '2026-08-01', description: 'Cafe Example 1' }),
      row({ id: 2, date: '2026-09-01', description: 'Cafe Example 1' }),
      row({ id: 3, date: '2026-10-01', description: 'Cafe Example 2' }),
      row({ id: 4, date: '2026-10-02', description: 'Cafe Example 2' }),
    ]

    expect(history(held, 'Cafe Example')).toMatchObject({ label: 'Cafe Example 2', settled: false })
  })

  it('breaks a tie on the date by the higher id, whatever order the rows arrive in', () => {
    const a = row({ id: 7, description: 'Cafe Example 1', categoryId: 1 })
    const b = row({ id: 9, description: 'Cafe Example 2', categoryId: 2 })

    expect(history([a, b], 'Cafe Example').label).toBe('Cafe Example 2')
    expect(history([b, a], 'Cafe Example').label).toBe('Cafe Example 2')
  })

  it('takes the category from the winning description rows, not from the merchant as a whole', () => {
    const held = [
      row({ id: 1, date: '2026-09-01', description: 'Cafe Example 1', categoryId: 4 }),
      row({ id: 2, date: '2026-09-02', description: 'Cafe Example 1', categoryId: 4 }),
      row({ id: 3, date: '2026-09-03', description: 'Cafe Example 1', categoryId: 6 }),
      row({ id: 4, date: '2026-10-01', description: 'Cafe Example 3', categoryId: 8 }),
      row({ id: 5, date: '2026-10-02', description: 'Cafe Example 3', categoryId: 8 }),
    ]

    expect(history(held, 'Cafe Example')).toMatchObject({ label: 'Cafe Example 1', categoryId: 4, settled: true })
  })

  it('gives a category tie to the more recent row', () => {
    const held = [row({ id: 1, date: '2026-09-01', categoryId: 4 }), row({ id: 2, date: '2026-10-01', categoryId: 6 })]

    expect(history(held, 'Cafe Example').categoryId).toBe(6)
  })

  it('settles on a lead of 3 to 2 and of 2 to 1, and not on 2 to 2 or 1 to 1', () => {
    const mix = (
      a: number,
      b: number,
    ) => [
      ...Array.from({ length: a }, (_, i) => row({ id: 10 + i, date: '2026-09-01', description: 'Cafe Example 1' })),
      ...Array.from({ length: b }, (_, i) => row({ id: 50 + i, date: '2026-09-02', description: 'Cafe Example 2' })),
    ]

    expect(history(mix(3, 2), 'Cafe Example').settled).toBe(true)
    expect(history(mix(2, 1), 'Cafe Example').settled).toBe(true)
    expect(history(mix(2, 2), 'Cafe Example').settled).toBe(false)
    expect(history(mix(1, 1), 'Cafe Example').settled).toBe(false)
  })

  it('folds runs of spaces inside a description as well as case', () => {
    const held = [
      row({ id: 1, description: 'Cafe   Example 1' }),
      row({ id: 2, description: 'CAFE Example  1 ' }),
      row({ id: 3, description: 'Cafe Example 2' }),
    ]

    expect(history(held, 'Cafe Example')).toMatchObject({ label: 'CAFE Example  1', settled: true })
  })

  it('is settled when the history is old but never varies', () => {
    const held = [
      row({ id: 1, date: '2025-09-01', description: 'Cafe Example 1' }),
      row({ id: 2, date: '2026-11-01', description: 'cafe example 1' }),
    ]

    expect(history(held, 'Cafe Example')).toMatchObject({ label: 'cafe example 1', sightings: 2, settled: true })
  })

  it('is not settled on old history that varies, when too little of it is recent to vote', () => {
    const held = [
      row({ id: 1, date: '2025-09-01', description: 'Cafe Example 1' }),
      row({ id: 2, date: '2026-11-01', description: 'Cafe Example 2' }),
    ]

    expect(history(held, 'Cafe Example')).toMatchObject({ label: 'Cafe Example 2', settled: false })
  })

  it('is not settled on a single row', () => {
    expect(history([row()], 'Cafe Example')).toMatchObject({ sightings: 1, settled: false })
  })

  it('takes the category from the winner rows that carry one, a tie to the more recent', () => {
    const held = [
      row({ id: 1, date: '2026-09-01', categoryId: null }),
      row({ id: 2, date: '2026-09-02', categoryId: null }),
      row({ id: 3, date: '2026-09-03', categoryId: 7 }),
    ]

    expect(history(held, 'Cafe Example').categoryId).toBe(7)
    expect(history([...held, row({ id: 4, date: '2026-09-04', categoryId: 8 })], 'Cafe Example').categoryId).toBe(8)
    expect(history(held.slice(0, 2), 'Cafe Example').categoryId).toBeNull()
  })

  it('needs the winner at least twice to settle', () => {
    expect(
      history([row({ id: 1 }), row({ id: 2, description: 'Cafe Example 5', date: '2026-10-02' })], 'Cafe Example')
        .settled,
    ).toBe(false)
  })

  it('falls back to the newest row when fewer than two are recent, and does not settle', () => {
    const held = [
      row({ id: 1, date: '2024-01-01', description: 'Cafe Example 8', categoryId: 1 }),
      row({ id: 2, date: '2024-02-01', description: 'Cafe Example 8', categoryId: 1 }),
      row({ id: 3, date: '2026-10-01', description: 'Cafe Example 9', categoryId: 2 }),
    ]

    expect(history(held, 'Cafe Example')).toEqual({
      sightings: 3,
      label: 'Cafe Example 9',
      categoryId: 2,
      settled: false,
    })
  })

  it("reads the window from this device's calendar day when none is given", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 14, 12))
    try {
      const held = [row({ id: 1, date: '2026-10-01' }), row({ id: 2, date: '2026-10-02' })]
      expect(merchantHistory(buildMerchantIndex(held), 'Cafe Example').settled).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('knows nothing of a person with no rows: the index holds only the rows it is given', () => {
    // The dataset the index reads is the signed-in person's own, so another person's habits are never in it.
    const mine = [row({ id: 1, description: 'Cafe Example 1' }), row({ id: 2, description: 'Cafe Example 1' })]

    expect(history([], 'Cafe Example').label).toBeNull()
    expect(history(mine, 'Cafe Example').label).toBe('Cafe Example 1')
  })

  it('ignores cancelled rows, other types, other merchants and a longer name', () => {
    const held = [
      row({ cancelled: true }),
      row({ type: 'income' }),
      row({ description: 'Cafe Elsewhere' }),
      row({ description: 'Cafe Example Two' }),
    ]

    expect(history(held, 'CAFE EXAMPLE')).toEqual({ sightings: 0, label: null, categoryId: null, settled: false })
  })

  it('knows nothing of a payment with no text', () => {
    expect(merchantHistory(buildMerchantIndex([row()], TODAY), null).sightings).toBe(0)
    expect(merchantHistory(buildMerchantIndex([row({ description: '12 34' })], TODAY), '12 34').sightings).toBe(0)
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
  settled: true,
  monthEdge: false,
  possibleMatch: false,
}

describe('reviewReasons', () => {
  it('is empty for a known merchant with nothing in doubt, which is the only case for one tap', () => {
    expect(reviewReasons(clean)).toEqual([])
  })

  it.each<[string, Partial<ReviewFacts>, string]>([
    ['no amount', { amountCents: null }, 'no-amount'],
    ['a zero amount', { amountCents: 0 }, 'zero-amount'],
    ['an investment', { suggestedType: 'investment' }, 'own-money'],
    ['no merchant', { hasMerchant: false }, 'no-merchant'],
    ['no category', { categoryId: null }, 'no-category'],
    ['no account', { accountId: null }, 'no-account'],
    ['another currency', { currency: 'USD' }, 'foreign'],
    ['own money moved', { suggestedType: null }, 'own-money'],
    ['near month end', { monthEdge: true }, 'month-edge'],
    ['a possible match', { possibleMatch: true }, 'possible-match'],
    ['seen once', { sightings: MIN_SIGHTINGS - 1, settled: false }, 'new-merchant'],
    ['a description not settled', { settled: false }, 'mixed-description'],
    ['a wording never accepted', { newShape: true }, 'new-shape'],
    ['an amount re-read', { amountRelearned: true }, 'amount-relearned'],
  ])('asks for a look on %s', (_name, over, reason) => {
    expect(reviewReasons({ ...clean, ...over })).toContain(reason)
  })

  it('does not call a merchant new when there is no merchant to be new', () => {
    expect(reviewReasons({ ...clean, hasMerchant: false, sightings: 0 })).toEqual(['no-merchant'])
    expect(reviewReasons({ ...clean, sightings: 1, settled: false })).toEqual(['new-merchant'])
  })

  it('treats an unknown currency as euros, like the rest of the capture code', () => {
    expect(reviewReasons({ ...clean, currency: null })).toEqual([])
  })

  it('never allows one tap for a type the app cannot add in one tap: every suggested type is either added or sent to Review', () => {
    for (const suggestedType of ['expense', 'income', 'refund', 'investment', null] as const) {
      for (const amountCents of [null, 0, 1250]) {
        const reasons = reviewReasons({ ...clean, suggestedType, amountCents })
        const addable =
          suggestedType !== null && suggestedType !== 'investment' && amountCents !== null && amountCents > 0
        expect(reasons.length === 0, `${suggestedType} ${amountCents}`).toBe(addable)
      }
    }
  })

  it('treats the server’s flags as absent until it sends them', () => {
    expect(reviewReasons({ ...clean, newShape: false, amountRelearned: false })).toEqual([])
  })

  it('names the server’s reasons in plain words, the amount next to the other amount reasons', () => {
    expect(reviewReasons({ ...clean, amountCents: 0, amountRelearned: true, newShape: true })).toEqual([
      'zero-amount',
      'amount-relearned',
      'new-shape',
    ])
    expect([REVIEW_TEXT['new-shape'], REVIEW_TEXT['amount-relearned']]).toEqual(['New push wording', 'Amount re-read'])
  })

  it('lists every reason, not only the first', () => {
    const reasons = reviewReasons({ ...clean, categoryId: null, monthEdge: true, possibleMatch: true })
    expect(reasons).toEqual(['no-category', 'month-edge', 'possible-match'])
  })
})
