import { describe, expect, it } from 'vitest'
import type { RecommendationInfo } from '../../data/recommendationsApi'
import { buildMerchantIndex, type ReviewReason } from '../../domain/capture/review'
import { EU_MONEY_FORMAT } from '../../engine/money'
import { makeRecommendation, makeReviewModel, makeSeriesModel, pushAt } from '../../testing/reviewKit'
import { describeRecommendation, seedOf, type ReviewView } from './reviewFields'
import { signedAmount } from './reviewFormat'
import { seriesHintsOf } from './reviewSeries'
import { relativeDay, rowButton, rowNote, rowTitle, rowWhen, type NoteTone } from './reviewRowText'

const TODAY = '2026-11-10'
const model = makeReviewModel()
const merchants = buildMerchantIndex(model.dataset.transactions)
const view = (over: Partial<RecommendationInfo> = {}) =>
  describeRecommendation(makeRecommendation(over), model, merchants)

const seriesModel = makeSeriesModel()
const seriesMerchants = buildMerchantIndex(seriesModel.dataset.transactions)
/** A payment read against the monthly series of `makeSeriesModel`, as the card reads it. */
function seriesView(over: Partial<RecommendationInfo>): ReviewView {
  const rec = makeRecommendation({ merchantRaw: 'PAYPROC*XY 77', ...over })
  const hint = seriesHintsOf([rec], seriesModel, seriesMerchants, {}).get(rec.id)
  return describeRecommendation(rec, seriesModel, seriesMerchants, hint)
}

/** What the person's own decisions say a merchant becomes, as the list sends it. */
const suggestion = (over: Partial<NonNullable<RecommendationInfo['suggestion']>> = {}) => ({
  description: 'Hardware shop',
  categoryId: 2,
  type: 'expense' as const,
  accountId: 1,
  amountCents: 1250,
  sightings: 3,
  settled: true,
  reasons: [],
  ...over,
})

const MOVEMENT = 'Example Bank alert: 43,80 EUR today'
const announced = { localDate: '2026-11-15', occurredAt: pushAt(2026, 11, 10, 10, 2) }

interface Kind {
  name: string
  view: ReviewView
  today?: string
  failed?: boolean
  title: string
  amount: string
  note: [string, NoteTone]
  button: 'add' | 'review'
  /** Under the amount on the card, then in the sheet. */
  when: [string, string]
}

/** One row per kind of payment the design draws. Invented data. */
const KINDS: Kind[] = [
  {
    name: 'a ready expense',
    view: view(),
    title: 'Cafe Example',
    amount: '−12,50 €',
    note: ['Eating out', 'plain'],
    button: 'add',
    when: ['Today', '09:41'],
  },
  {
    name: 'a merchant seen for the first time',
    view: view({ merchantRaw: 'FERRETERIA EJEMPLO', suggestion: suggestion({ sightings: 1, settled: false }) }),
    title: 'Hardware shop',
    amount: '−12,50 €',
    note: ['New merchant', 'plain'],
    button: 'review',
    when: ['Today', '09:41'],
  },
  {
    name: 'income',
    view: view({ suggestedType: 'income', amountCents: 185000 }),
    title: 'Cafe Example',
    amount: '+1.850,00 €',
    note: ['Eating out', 'plain'],
    button: 'add',
    when: ['Today', '09:41'],
  },
  {
    name: 'a refund',
    view: view({ suggestedType: 'refund', amountCents: 2500 }),
    title: 'Cafe Example',
    amount: '+25,00 €',
    note: ['Refund · Eating out', 'plain'],
    button: 'add',
    when: ['Today', '09:41'],
  },
  {
    name: 'own money moved, direction not known',
    view: view({ suggestedType: null, amountCents: 30000 }),
    title: 'Cafe Example',
    amount: '300,00 €',
    note: ['Pick a type', 'need'],
    button: 'review',
    when: ['Today', '09:41'],
  },
  {
    name: 'a suggested investment',
    view: view({ suggestedType: 'investment', amountCents: 40000 }),
    title: 'Cafe Example',
    amount: '−400,00 €',
    note: ['Check the type', 'need'],
    button: 'review',
    when: ['Today', '09:41'],
  },
  {
    name: 'an unnamed payment',
    view: view({ merchantRaw: MOVEMENT, amountCents: 4380, occurredAt: pushAt(2026, 11, 10, 3, 50) }),
    title: 'Unnamed',
    amount: '−43,80 €',
    note: ['No merchant, 03:50', 'plain'],
    button: 'review',
    when: ['Today', '03:50'],
  },
  {
    name: 'an unnamed income',
    view: view({ merchantRaw: MOVEMENT, amountCents: 4800, suggestedType: 'income' }),
    title: 'Unnamed',
    amount: '+48,00 €',
    note: ['No merchant, 09:41', 'plain'],
    button: 'review',
    when: ['Today', '09:41'],
  },
  {
    name: 'a charge the bank announced, not yet taken',
    view: view({ ...announced, merchantRaw: MOVEMENT, amountCents: 6215 }),
    title: 'Unnamed',
    amount: '−62,15 €',
    note: ['Not charged yet', 'plain'],
    button: 'review',
    when: ['Charges 15 Nov', 'Charges 15 Nov'],
  },
  {
    name: 'income the bank announced, not yet arrived',
    view: view({ ...announced, merchantRaw: MOVEMENT, amountCents: 12000, suggestedType: 'income' }),
    title: 'Unnamed',
    amount: '+120,00 €',
    note: ['Not arrived yet', 'plain'],
    button: 'review',
    when: ['Arrives 15 Nov', 'Arrives 15 Nov'],
  },
  {
    name: 'an announced charge whose day has come',
    view: view({ ...announced, merchantRaw: MOVEMENT, amountCents: 6215 }),
    today: '2026-11-16',
    title: 'Unnamed',
    amount: '−62,15 €',
    note: ['Notice, 10 Nov', 'plain'],
    button: 'review',
    when: ['Yesterday', 'Announced'],
  },
  {
    name: 'a payment the bank reported days late',
    view: view({ localDate: '2026-11-06', occurredAt: pushAt(2026, 11, 10, 21, 32) }),
    title: 'Cafe Example',
    amount: '−12,50 €',
    note: ['Eating out', 'plain'],
    button: 'add',
    when: ['Fri 6 Nov', '6 Nov'],
  },
  {
    name: 'a payment not in euros',
    view: view({ currency: 'USD', amountCents: 1820 }),
    title: 'Cafe Example',
    amount: '−US$18.20',
    note: ['Not in euros', 'need'],
    button: 'review',
    when: ['Today', '09:41'],
  },
  {
    name: 'a payment with no amount',
    view: view({ amountCents: null }),
    title: 'Cafe Example',
    amount: '',
    note: ['Amount missing', 'need'],
    button: 'review',
    when: ['Today', '09:41'],
  },
  {
    name: 'an amount of zero',
    view: view({ amountCents: 0 }),
    title: 'Cafe Example',
    amount: '0,00 €',
    note: ['Amount is zero', 'need'],
    button: 'review',
    when: ['Today', '09:41'],
  },
  {
    name: 'an amount read in a new place',
    view: view({ suggestion: suggestion({ amountCents: 990, reasons: ['amount-relearned'] }) }),
    title: 'Hardware shop',
    amount: '−9,90 €',
    note: ['Check the amount', 'need'],
    button: 'review',
    when: ['Today', '09:41'],
  },
  {
    name: 'a named payment with no category',
    view: view({ merchantRaw: 'KIOSCO EJEMPLO' }),
    title: 'KIOSCO EJEMPLO',
    amount: '−12,50 €',
    note: ['No category', 'need'],
    button: 'review',
    when: ['Today', '09:41'],
  },
  {
    name: 'a card not linked to an account',
    view: view({ accountId: null, card: { source: 'bank', digits: '0000' } }),
    title: 'Cafe Example',
    amount: '−12,50 €',
    note: ['Which account?', 'need'],
    button: 'review',
    when: ['Today', '09:41'],
  },
  {
    name: 'a budget month in doubt',
    view: view({ localDate: '2026-10-31', occurredAt: pushAt(2026, 10, 31, 23, 48) }),
    today: '2026-11-01',
    title: 'Cafe Example',
    amount: '−12,50 €',
    note: ['Oct or Nov budget?', 'need'],
    button: 'review',
    when: ['Yesterday', '23:48'],
  },
  {
    name: 'a payment that looks like a monthly one',
    view: seriesView({ amountCents: 1299, localDate: '2026-11-11', occurredAt: pushAt(2026, 11, 11, 7, 2) }),
    today: '2026-11-12',
    title: 'Video Stream',
    amount: '−12,99 €',
    note: ['Monthly, due 10 Nov', 'plain'],
    button: 'review',
    when: ['Yesterday', '07:02'],
  },
  {
    name: 'a payment that could be either of two monthly bills',
    view: seriesView({ amountCents: 999, localDate: '2026-11-14', occurredAt: pushAt(2026, 11, 14, 7, 30) }),
    today: '2026-11-14',
    title: 'PAYPROC*XY',
    amount: '−9,99 €',
    note: ['Which monthly bill?', 'need'],
    button: 'review',
    when: ['Today', '07:30'],
  },
  {
    name: 'a payment that may be entered already',
    view: view({ possibleMatch: { transactionId: 7, description: 'Lunch', date: '2026-11-10' } }),
    title: 'Cafe Example',
    amount: '−12,50 €',
    note: ['Possible duplicate', 'chip'],
    button: 'review',
    when: ['Today', '09:41'],
  },
  {
    name: 'a merchant named more than one way',
    view: view({ suggestion: suggestion({ settled: false }) }),
    title: 'Hardware shop',
    amount: '−12,50 €',
    note: ['Name not settled', 'plain'],
    button: 'review',
    when: ['Today', '09:41'],
  },
  {
    name: 'a message worded in a new way',
    view: view({ suggestion: suggestion({ reasons: ['new-shape'] }) }),
    title: 'Hardware shop',
    amount: '−12,50 €',
    note: ['New wording', 'plain'],
    button: 'review',
    when: ['Today', '09:41'],
  },
  {
    name: 'a send that failed',
    view: view(),
    failed: true,
    title: 'Cafe Example',
    amount: '−12,50 €',
    note: ['Not sent. Try again', 'bad'],
    button: 'add',
    when: ['Today', '09:41'],
  },
]

describe.each(KINDS)('the row of $name', (kind) => {
  const today = kind.today ?? TODAY

  it('has its title, amount, one note in its colour, and its one button', () => {
    expect(rowTitle(kind.view).text).toBe(kind.title)
    expect(signedAmount(kind.view, EU_MONEY_FORMAT)).toBe(kind.amount)
    const [text, tone] = kind.note
    // The card adds the time to a payment nobody named; the sheet shows the time under the amount already.
    expect(rowNote(kind.view, 'card', today, kind.failed)).toEqual({ text, tone })
    expect(rowButton(kind.view)).toBe(kind.button)
  })

  it('says when under the amount: the day on the card, the time in the sheet', () => {
    expect([rowWhen(kind.view, 'card', today), rowWhen(kind.view, 'sheet', today)]).toEqual(kind.when)
  })
})

describe('the title', () => {
  it('is the person’s own name for the merchant, before the bank’s', () => {
    expect(rowTitle(view({ suggestion: suggestion({ description: 'Weekly shop' }) })).text).toBe('Weekly shop')
    expect(rowTitle(view()).text).toBe('Cafe Example')
  })

  it('is the merchant as the bank wrote it, less its store number, when the person never named it', () => {
    expect(rowTitle(view({ merchantRaw: 'MERCADO EJEMPLO 0042' }))).toEqual({
      text: 'MERCADO EJEMPLO',
      long: 'MERCADO EJEMPLO',
    })
    expect(view({ merchantRaw: 'BAR 33 EJEMPLO' }).unnamed).toBe(false)
  })

  it.each([
    'Example Bank alert: 43,80 EUR today',
    'A shop took 12,50€ just now',
    'You paid $18.20 at a shop',
    'Approved, 1.250,00 EUR in all',
    'EUR 9,99 booked this morning',
    '62,15 € to EXAMPLE UTILITY, thank you',
  ])('is "Unnamed" for a whole message, whatever its wording: %s', (merchantRaw) => {
    const unnamed = view({ merchantRaw })
    expect(unnamed.unnamed).toBe(true)
    expect(rowTitle(unnamed)).toEqual({ text: 'Unnamed', long: 'Unnamed payment' })
    expect(rowTitle(unnamed).text).not.toContain(merchantRaw.slice(0, 8))
  })

  it('takes the list’s word for it: the same text is a name or not as the list says', () => {
    expect(rowTitle(view({ merchantRaw: 'MERCADO EJEMPLO', named: false })).text).toBe('Unnamed')
    expect(rowTitle(view({ merchantRaw: 'MERCADO EJEMPLO', named: true })).text).toBe('MERCADO EJEMPLO')
    // A list that does not say (an older server) keeps the text as the name it always was.
    const older = makeRecommendation({ merchantRaw: 'MERCADO EJEMPLO' })
    delete older.named
    expect(rowTitle(describeRecommendation(older, model, merchants)).text).toBe('MERCADO EJEMPLO')
  })

  it('is "Unnamed" with no text at all, and for a sentence too long to be a name', () => {
    expect(rowTitle(view({ merchantRaw: null })).text).toBe('Unnamed')
    const sentence = 'Your operation went through without any problem and you can now look it up in the list of the app'
    expect(rowTitle(view({ merchantRaw: sentence })).text).toBe('Unnamed')
  })

  it('names what an unnamed payment is by the way its money moves', () => {
    expect(rowTitle(view({ merchantRaw: MOVEMENT, suggestedType: 'income' })).long).toBe('Unnamed income')
    expect(rowTitle(view({ merchantRaw: MOVEMENT, suggestedType: 'refund' })).long).toBe('Unnamed income')
    expect(rowTitle(view({ merchantRaw: MOVEMENT, suggestedType: 'investment' })).long).toBe('Unnamed payment')
    expect(rowTitle(view({ merchantRaw: MOVEMENT, suggestedType: null })).long).toBe('Unnamed movement')
  })

  it('is the monthly payment’s name when a series names a whole message', () => {
    const named = seriesView({
      merchantRaw: 'Taken today: 12,99 EUR for a bill',
      amountCents: 1299,
      localDate: '2026-11-11',
    })
    expect(named.unnamed).toBe(false)
    expect(rowTitle(named).text).toBe('Video Stream')
  })

  it('opens the review view with no description for an unnamed payment, never the bank’s sentence', () => {
    expect(seedOf(view({ merchantRaw: MOVEMENT }))).not.toHaveProperty('description')
    expect(seedOf(view()).description).toBe('Cafe Example')
  })
})

describe('the note in the sheet', () => {
  it('does not repeat the time for a payment nobody named', () => {
    expect(rowNote(view({ merchantRaw: MOVEMENT }), 'sheet', TODAY).text).toBe('No merchant named')
  })

  it('says so too on the card when the payment has no time', () => {
    expect(rowNote(view({ merchantRaw: MOVEMENT, occurredAt: '2026-11-10T08:41:07Z' }), 'card', TODAY).text).toBe(
      'No merchant named',
    )
  })
})

describe('the day under the amount', () => {
  it('is Today, Yesterday, then the weekday and date, counted from the day given', () => {
    expect(relativeDay('2026-11-10', TODAY)).toBe('Today')
    expect(relativeDay('2026-11-09', TODAY)).toBe('Yesterday')
    expect(relativeDay('2026-11-08', TODAY)).toBe('Sun 8 Nov')
    expect(relativeDay('2026-10-31', '2026-11-01')).toBe('Yesterday')
    expect(relativeDay('2026-11-11', TODAY)).toBe('Wed 11 Nov')
  })
})

/**
 * Each note the row can show, most pressing first, as the smallest change to a ready payment that brings it up. With
 * any two at once the row shows the earlier one.
 */
const BASE = view()
const reason = (r: ReviewReason): Partial<ReviewView> => ({ reasons: [r] })
const TWO_SERIES = seriesView({ amountCents: 999, localDate: '2026-11-14' }).hint
const ONE_SERIES = seriesView({ amountCents: 1299, localDate: '2026-11-11' }).hint
const PRIORITY: Array<[string, Partial<ReviewView>, { failed?: boolean; not?: string[] }?]> = [
  ['Not sent. Try again', {}, { failed: true }],
  ['Possible duplicate', reason('possible-match')],
  ['Not in euros', reason('foreign')],
  ['Amount missing', reason('no-amount')],
  ['Amount is zero', reason('zero-amount')],
  ['Check the amount', reason('amount-relearned')],
  ['Pick a type', { ...reason('own-money'), type: null }],
  ['Which monthly bill?', { hint: TWO_SERIES }, { not: ['Monthly, due 10 Nov'] }],
  ['Which account?', reason('no-account')],
  ['Oct or Nov budget?', { ...reason('month-edge'), budgetMonth: '2026-11', edgeMonth: '2026-10' }],
  [
    'Not charged yet',
    { date: '2026-11-15', fromMessage: { arrivedDate: '2026-11-09', arrivedTime: '10:02' } },
    { not: ['Notice, 9 Nov'] },
  ],
  ['Notice, 9 Nov', { fromMessage: { arrivedDate: '2026-11-09', arrivedTime: '10:02' } }],
  ['Monthly, due 10 Nov', { hint: ONE_SERIES }],
  ['No category', reason('no-category'), { not: ['No merchant, 09:41'] }],
  ['No merchant, 09:41', { unnamed: true }],
  ['Name not settled', reason('mixed-description')],
  ['New merchant', reason('new-merchant')],
  ['New wording', reason('new-shape')],
]

describe('when several notes apply', () => {
  const cases = PRIORITY.flatMap(([first, a, how], i) =>
    PRIORITY.slice(i + 1)
      .filter(([second]) => !how?.not?.includes(second))
      .map(([second, b, other]) => ({ first, second, a, b, failed: how?.failed ?? other?.failed ?? false })),
  )

  it.each(cases)('"$first" is shown before "$second"', ({ first, a, b, failed }) => {
    const both = { ...BASE, ...b, ...a, reasons: [...(b.reasons ?? []), ...(a.reasons ?? [])] }
    expect(rowNote(both, 'card', TODAY, failed).text).toBe(first)
  })

  it('shows each of them when it is the only one', () => {
    for (const [text, patch, how] of PRIORITY)
      expect(rowNote({ ...BASE, ...patch }, 'card', TODAY, how?.failed).text).toBe(text)
  })

  it('falls back to what the payment is when none applies', () => {
    expect(rowNote(BASE, 'card', TODAY)).toEqual({ text: 'Eating out', tone: 'plain' })
  })
})
