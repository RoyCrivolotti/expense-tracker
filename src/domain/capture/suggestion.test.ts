import { describe, expect, it } from 'vitest'
import type { TemplateFacts } from './learn'
import type { NumberSlot, Slot } from './slots'
import { suggestFor, type MerchantRow, type SuggestionInput } from './suggestion'

const facts = (over: Partial<TemplateFacts> = {}): TemplateFacts => ({
  accepts: 1,
  dismissals: 0,
  dismissStreak: 0,
  amountSlot: null,
  amountMark: null,
  type: null,
  accountId: null,
  ignoredAt: null,
  ...over,
})

const amount = (
  index: number,
  candidates: NumberSlot['candidates'],
  currency: string | null = 'EUR',
): NumberSlot => ({
  kind: 'number',
  index,
  raw: '',
  candidates,
  currency,
  negative: false,
})

const rec = (over: Partial<SuggestionInput> = {}): SuggestionInput => ({
  amountCents: 1250,
  accountId: null,
  suggestedType: 'expense',
  slots: [amount(2, [{ cents: 1250, mark: 'comma' }])],
  ...over,
})

const row = (
  description: string,
  votes: number,
  over: Partial<MerchantRow> = {},
): MerchantRow => ({
  amountCents: -1,
  description,
  categoryId: 1,
  votes,
  lastSeen: '2026-11-01T10:00:00.000Z',
  ...over,
})

describe('suggestFor, the description and category', () => {
  it('prefers the rows at the payment’s price over the rows at any price', () => {
    const rows = [
      row('Music', 5, { categoryId: 2 }),
      row('Video', 2, { amountCents: 1250, categoryId: 3 }),
      row('Video', 2, { categoryId: 3 }),
    ]
    expect(suggestFor(rec(), facts(), rows)).toMatchObject({
      description: 'Video',
      categoryId: 3,
      sightings: 2,
      settled: true,
    })
  })

  it('lets a thin price row that agrees with the settled history give way to every price', () => {
    const rows = [row('Coffee', 10), row('Coffee', 1, { amountCents: 1250 })]
    expect(suggestFor(rec(), facts(), rows)).toMatchObject({ description: 'Coffee', sightings: 10, settled: true })
  })

  it('keeps a thin price row that names something else, but never settles on it', () => {
    const rows = [row('Coffee', 10), row('Cake', 1, { amountCents: 1250, categoryId: 5 })]
    expect(suggestFor(rec(), facts(), rows)).toMatchObject({
      description: 'Cake',
      categoryId: 5,
      sightings: 1,
      settled: false,
    })
  })

  it('uses every price when neither is settled, and the price row when every price has none', () => {
    expect(suggestFor(rec(), facts(), [row('Coffee', 1), row('Cake', 1, { amountCents: 1250 })])).toMatchObject({
      description: 'Coffee',
      sightings: 1,
    })
    expect(suggestFor(rec(), facts(), [row('Cake', 1, { amountCents: 1250 })])).toMatchObject({
      description: 'Cake',
      sightings: 1,
      settled: false,
    })
  })

  it('falls back to the rows at any price when the price has none', () => {
    const rows = [row('Coffee', 3), row('Coffee', 3, { amountCents: 340 }), row('Lunch', 1)]
    expect(suggestFor(rec(), facts(), rows)).toMatchObject({ description: 'Coffee', sightings: 4, settled: true })
  })

  it('settles only on a strict lead of at least two votes', () => {
    expect(suggestFor(rec(), facts(), [row('Coffee', 2), row('Lunch', 2)]).settled).toBe(false)
    expect(suggestFor(rec(), facts(), [row('Coffee', 1)])).toMatchObject({
      description: 'Coffee',
      sightings: 1,
      settled: false,
    })
    expect(suggestFor(rec(), facts(), [row('Coffee', 3), row('Lunch', 2)]).settled).toBe(true)
  })

  it('breaks a tie to the more recently used description', () => {
    const rows = [
      row('Coffee', 2, { lastSeen: '2026-10-01' }),
      row('Lunch', 2, { lastSeen: '2026-11-01', categoryId: 9 }),
    ]
    expect(suggestFor(rec(), facts(), rows)).toMatchObject({ description: 'Lunch', categoryId: 9, settled: false })
  })

  it('sums the votes of spellings that fold alike and shows the latest spelling with its category', () => {
    const rows = [
      row('cafe', 1, { lastSeen: '2026-10-01', categoryId: 1 }),
      row('Café', 1, { lastSeen: '2026-11-01', categoryId: 4 }),
      row('Lunch', 1),
    ]
    expect(suggestFor(rec(), facts(), rows)).toMatchObject({
      description: 'Café',
      categoryId: 4,
      sightings: 3,
      settled: true,
    })
  })

  it('suggests no description with no history, and none at a price for a payment of no amount', () => {
    expect(suggestFor(rec(), facts(), [])).toMatchObject({
      description: null,
      categoryId: null,
      sightings: 0,
      settled: false,
    })
    const noAmount = rec({ amountCents: null, slots: [] })
    expect(suggestFor(noAmount, facts(), [row('Video', 3, { amountCents: 1250 }), row('Music', 1)]).description).toBe(
      'Music',
    )
  })
})

describe('suggestFor, the type and account', () => {
  it('takes the type the template learned, else the first guess', () => {
    expect(suggestFor(rec(), facts({ type: 'refund' }), []).type).toBe('refund')
    expect(suggestFor(rec({ suggestedType: 'income' }), facts(), []).type).toBe('income')
    expect(suggestFor(rec({ suggestedType: null }), null, []).type).toBeNull()
  })

  it('ignores a learned type a suggestion cannot carry', () => {
    expect(suggestFor(rec(), facts({ type: 'transfer' }), []).type).toBe('expense')
  })

  it('takes the card’s account, else the template’s', () => {
    expect(suggestFor(rec({ accountId: 4 }), facts({ accountId: 9 }), []).accountId).toBe(4)
    expect(suggestFor(rec(), facts({ accountId: 9 }), []).accountId).toBe(9)
    expect(suggestFor(rec(), null, []).accountId).toBeNull()
  })
})

describe('suggestFor, the amount', () => {
  const two: Slot[] = [
    amount(2, [{ cents: 1250, mark: 'comma' }]),
    amount(6, [
      { cents: 123400, mark: 'comma' },
      { cents: 123, mark: 'dot', ambiguous: true },
    ]),
  ]

  it('reads the slot and mark the template learned, and says the amount was re-read', () => {
    const s = suggestFor(rec({ slots: two }), facts({ amountSlot: 6, amountMark: 'dot' }), [])
    expect(s).toMatchObject({ amountCents: 123, reasons: ['amount-relearned'] })
  })

  it('takes the only reading when the learned mark is not among them', () => {
    const slots = [amount(6, [{ cents: 500, mark: 'none' }])]
    expect(suggestFor(rec({ slots }), facts({ amountSlot: 6, amountMark: 'comma' }), []).amountCents).toBe(500)
  })

  it('keeps the first reading when the learned slot reads the same', () => {
    expect(suggestFor(rec({ slots: two }), facts({ amountSlot: 2, amountMark: 'comma' }), [])).toMatchObject({
      amountCents: 1250,
      reasons: [],
    })
  })

  it('keeps the first reading when the learned position holds no number with a currency marker', () => {
    const moved: Slot[] = [
      amount(2, [{ cents: 1250, mark: 'comma' }]),
      amount(6, [{ cents: 4200, mark: 'none' }], null),
      { kind: 'masked-digits', index: 7, digits: '1234' },
    ]
    expect(suggestFor(rec({ slots: moved }), facts({ amountSlot: 6, amountMark: 'none' }), []).amountCents).toBe(1250)
    expect(suggestFor(rec({ slots: moved }), facts({ amountSlot: 7, amountMark: 'none' }), []).amountCents).toBe(1250)
    expect(suggestFor(rec({ slots: moved }), facts({ amountSlot: 9, amountMark: 'none' }), []).amountCents).toBe(1250)
  })

  it('looks up the price rows at the re-read amount', () => {
    const s = suggestFor(rec({ slots: two }), facts({ amountSlot: 6, amountMark: 'dot' }), [
      row('Parking', 2, { amountCents: 123 }),
      row('Coffee', 5),
    ])
    expect(s.description).toBe('Parking')
  })
})

describe('suggestFor, the reasons', () => {
  it('flags a wording the person has never accepted, or a push with no template', () => {
    expect(suggestFor(rec(), facts({ accepts: 0 }), []).reasons).toEqual(['new-shape'])
    expect(suggestFor(rec(), null, []).reasons).toEqual(['new-shape'])
    expect(suggestFor(rec(), facts({ accepts: 1 }), []).reasons).toEqual([])
  })
})
