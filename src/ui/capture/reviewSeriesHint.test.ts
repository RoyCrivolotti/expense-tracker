import { describe, expect, it } from 'vitest'
import type { RecommendationInfo } from '../../data/recommendationsApi'
import { buildMerchantIndex } from '../../domain/capture/review'
import { groupKeyString, groupTransactions } from '../../domain/engine/recurringDetect'
import { makeRecommendation, makeSeriesModel } from '../../testing/reviewKit'
import type { ExpenseModel } from '../useExpenseData'
import { describeRecommendation, seedOf, transactionOf } from './reviewFields'
import { introNotes } from './reviewNotes'
import { rowButton, rowNote } from './reviewRowText'
import { seriesHintsOf } from './reviewSeries'
import { whyReasons } from './reviewWhy'

const model = makeSeriesModel()
const merchants = buildMerchantIndex(model.dataset.transactions, '2026-11-14')

/** A push no history knows, so whatever names it comes from the series. */
const push = (over: Partial<RecommendationInfo> = {}) =>
  makeRecommendation({ merchantRaw: 'PAYPROC*XY 77', amountCents: 1299, localDate: '2026-11-11', ...over })

const settled = (description: string) => ({
  description,
  categoryId: 1,
  type: 'expense' as const,
  accountId: 1,
  amountCents: 1299,
  sightings: 3,
  settled: true,
  reasons: [],
})

/** The view the card shows for `rec`, with the hint the whole page's match gives it. */
function viewOf(
  rec: RecommendationInfo,
  on: ExpenseModel = model,
) {
  const hint = seriesHintsOf([rec], on, merchants, {}).get(rec.id)
  return describeRecommendation(rec, on, merchants, hint)
}

describe('a push that fits one monthly series', () => {
  it('fills the description, category and type from the series, and goes through review', () => {
    const v = viewOf(push({ suggestedType: 'refund', amountCents: 1299 }))
    // A refund is money in, so it never fits a charge.
    expect(v.hint).toBeNull()

    const fitted = viewOf(push())
    expect(fitted).toMatchObject({
      description: 'Video Stream',
      fromHistory: false,
      categoryId: 2,
      categoryName: 'Groceries',
      type: 'expense',
      accountId: 1,
      oneTap: false,
      hintAccount: null,
    })
    expect(fitted.hint).toMatchObject({
      kind: 'series',
      series: { description: 'Video Stream', usualDate: '2026-11-10' },
    })
    expect(transactionOf(fitted)).toBeNull()
    expect(seedOf(fitted)).toMatchObject({ description: 'Video Stream', categoryId: 2, type: 'expense', accountId: 1 })
    // The bank text is new, but the hint already says what the payment is.
    expect(fitted.reasons).not.toContain('new-merchant')
  })

  it('takes the series’ type over the push’s when both move money out', () => {
    const v = viewOf(push({ amountCents: 40000, localDate: '2026-11-20', suggestedType: 'expense' }))

    expect(v.hint).toMatchObject({ kind: 'series', series: { description: 'Index Plan' } })
    expect(v).toMatchObject({ description: 'Index Plan', type: 'investment', oneTap: false })
    expect(seedOf(v)).toMatchObject({ type: 'investment' })
  })

  it('names and fills the series’ account when the push named none and has no card to ask about', () => {
    const v = viewOf(push({ accountId: null, card: null }))

    expect(v).toMatchObject({ description: 'Video Stream', accountId: 1, accountName: 'Main Debit', askCard: null })
    expect(v.hintAccount).toBe('Main Debit')
  })

  it('names a whole message by the series it fits, and no longer says the bank named no merchant', () => {
    const sentence = 'Example Bank alert: 12,99 EUR today'
    const alone = viewOf(push({ merchantRaw: sentence, amountCents: 5555 }))
    expect(alone).toMatchObject({ unnamed: true, hint: null })
    expect(alone.reasons).toContain('no-merchant')

    const fitted = viewOf(push({ merchantRaw: sentence }))
    expect(fitted).toMatchObject({ unnamed: false, description: 'Video Stream', filled: true })
    expect(fitted.reasons).not.toContain('no-merchant')
    expect(fitted.reasons).not.toContain('new-merchant')
  })

  it('never adds by one tap a payment whose series is paid from another account, even under the name it already has', () => {
    const v = viewOf(push({ accountId: 2, suggestion: { ...settled('Video Stream'), categoryId: 2, accountId: 2 } }))

    expect(v.hint).toMatchObject({ kind: 'moved' })
    // Nothing else is in doubt: the name is the series' own, so no field was filled from it.
    expect(v).toMatchObject({ filled: false, reasons: [], oneTap: false })
    expect(transactionOf(v)).toBeNull()
    expect(rowNote(v, 'card', '2026-11-11')).toEqual({ text: 'Check the account', tone: 'need' })
    expect(rowButton(v)).toBe('review')
  })

  it('says in the review view what the series asks: moved, renamed, and the monthly payment it looks like', () => {
    const moved = viewOf(push({ accountId: 2 }))
    expect(whyReasons(moved, undefined, '2026-11-11')).toContain(
      'you pay Video Stream from Main Debit, so it may have moved',
    )
    expect(introNotes(moved)).toEqual([{ text: 'Looks like your monthly Video Stream, due 10\u00a0Nov.', warn: false }])

    const renamed = viewOf(push({ suggestion: settled('Old Stream') }))
    expect(whyReasons(renamed, undefined, '2026-11-11')).toContain(
      'you added it as Old Stream before, so it may have been renamed',
    )

    // A push that names no account: the series' account is in the fields, and the line names it too.
    const plain = viewOf(push({ accountId: null }))
    expect(plain.hint).toMatchObject({ kind: 'series' })
    expect(introNotes(plain)).toEqual([
      { text: 'Looks like your monthly Video Stream, due 10\u00a0Nov, paid from Main Debit.', warn: false },
    ])
    expect(introNotes(viewOf(push()))).toEqual([
      { text: 'Looks like your monthly Video Stream, due 10\u00a0Nov.', warn: false },
    ])
  })

  it('says money coming in arrives into an account, where a charge is paid from one', () => {
    const income = (over: Partial<RecommendationInfo>) =>
      viewOf(push({ suggestedType: 'income', amountCents: 185000, localDate: '2026-11-25', ...over }))

    const moved = income({ accountId: 2 })
    expect(moved.hint).toMatchObject({ kind: 'moved', series: { description: 'Pay Example' } })
    expect(rowNote(moved, 'card', '2026-11-25')).toEqual({ text: 'Check the account', tone: 'need' })
    const why = whyReasons(moved, undefined, '2026-11-25')
    expect(why).toContain('Pay Example usually comes into Main Debit, so it may have moved')
    expect(why.join(' ')).not.toMatch(/you pay/)

    expect(introNotes(income({ accountId: null }))).toEqual([
      { text: 'Looks like your monthly Pay Example, due 25\u00a0Nov, paid into Main Debit.', warn: false },
    ])
  })

  it('asks which monthly payment an income is, and which monthly bill a charge is, when two fit', () => {
    const income = viewOf(push({ suggestedType: 'income', amountCents: 60000, localDate: '2026-11-03' }))
    expect(income.hint).toMatchObject({ kind: 'choose' })
    expect(rowNote(income, 'card', '2026-11-03')).toEqual({ text: 'Which monthly payment?', tone: 'need' })

    const charge = viewOf(push({ amountCents: 999, localDate: '2026-11-14' }))
    expect(charge.hint).toMatchObject({ kind: 'choose' })
    expect(rowNote(charge, 'card', '2026-11-14')).toEqual({ text: 'Which monthly bill?', tone: 'need' })
  })

  it('has no line about a monthly payment without one, or for two that fit, which the form asks about itself', () => {
    expect(introNotes(viewOf(makeRecommendation({ merchantRaw: 'TIENDA EJEMPLO' })))).toEqual([])
    const two = viewOf(push({ amountCents: 999, localDate: '2026-11-14' }))
    expect(two.hint).toMatchObject({ kind: 'choose' })
    expect(introNotes(two)).toEqual([])
  })

  it('says what the bank wrote for an amount not in euros, and nothing when there is no amount', () => {
    const foreign = viewOf(makeRecommendation({ merchantRaw: 'TIENDA EJEMPLO', currency: 'USD', amountCents: 1820 }))
    expect(introNotes(foreign)).toEqual([
      { text: 'The message says US$18.20. Type the amount in euros your bank charged.', warn: true },
    ])
    expect(
      introNotes(viewOf(makeRecommendation({ merchantRaw: 'TIENDA EJEMPLO', currency: 'USD', amountCents: null }))),
    ).toEqual([])
  })

  it('asks what money coming in in another currency came to, not what the bank charged', () => {
    for (const suggestedType of ['income', 'refund'] as const) {
      const view = viewOf(
        makeRecommendation({ merchantRaw: 'TIENDA EJEMPLO', currency: 'USD', amountCents: 1820, suggestedType }),
      )
      expect(introNotes(view), suggestedType).toEqual([
        { text: 'The message says US$18.20. Type the amount in euros it came to.', warn: true },
      ])
    }
  })

  it('names the series’ account but leaves the card question to the person when the push showed an unlinked card', () => {
    const v = viewOf(push({ accountId: null, card: { source: 'bank', digits: '0000' } }))

    expect(v).toMatchObject({ description: 'Video Stream', accountId: null, askCard: { digits: '0000' } })
    expect(v.hintAccount).toBe('Main Debit')
  })

  it('never adds by one tap a payment whose series is paid from another account, even under the name it already has', () => {
    const v = viewOf(push({ accountId: 2, suggestion: { ...settled('Video Stream'), categoryId: 2, accountId: 2 } }))

    expect(v.hint).toMatchObject({ kind: 'moved' })
    // Nothing else is in doubt: the name is the series' own, so no field was filled from it.
    expect(v).toMatchObject({ filled: false, reasons: [], oneTap: false })
    expect(transactionOf(v)).toBeNull()
    expect(rowNote(v, 'card', '2026-11-11')).toEqual({ text: 'Check the account', tone: 'need' })
    expect(rowButton(v)).toBe('review')
  })

  it('says in the review view what the series asks: moved, renamed, and the monthly payment it looks like', () => {
    const moved = viewOf(push({ accountId: 2 }))
    expect(whyReasons(moved, undefined, '2026-11-11')).toContain(
      'you pay Video Stream from Main Debit, so it may have moved',
    )
    expect(introNotes(moved)).toEqual([{ text: 'Looks like your monthly Video Stream, due 10\u00a0Nov.', warn: false }])

    const renamed = viewOf(push({ suggestion: settled('Old Stream') }))
    expect(whyReasons(renamed, undefined, '2026-11-11')).toContain(
      'you added it as Old Stream before, so it may have been renamed',
    )

    // A push that names no account: the series' account is in the fields, and the line names it too.
    const plain = viewOf(push({ accountId: null }))
    expect(plain.hint).toMatchObject({ kind: 'series' })
    expect(introNotes(plain)).toEqual([
      { text: 'Looks like your monthly Video Stream, due 10\u00a0Nov, paid from Main Debit.', warn: false },
    ])
    expect(introNotes(viewOf(push()))).toEqual([
      { text: 'Looks like your monthly Video Stream, due 10\u00a0Nov.', warn: false },
    ])
  })

  it('has no line about a monthly payment without one, or for two that fit, which the form asks about itself', () => {
    expect(introNotes(viewOf(makeRecommendation({ merchantRaw: 'TIENDA EJEMPLO' })))).toEqual([])
    const two = viewOf(push({ amountCents: 999, localDate: '2026-11-14' }))
    expect(two.hint).toMatchObject({ kind: 'choose' })
    expect(introNotes(two)).toEqual([])
  })

  it('says what the bank wrote for an amount not in euros, and nothing when there is no amount', () => {
    const foreign = viewOf(makeRecommendation({ merchantRaw: 'TIENDA EJEMPLO', currency: 'USD', amountCents: 1820 }))
    expect(introNotes(foreign)).toEqual([
      { text: 'The message says US$18.20. Type the amount in euros your bank charged.', warn: true },
    ])
    expect(
      introNotes(viewOf(makeRecommendation({ merchantRaw: 'TIENDA EJEMPLO', currency: 'USD', amountCents: null }))),
    ).toEqual([])
  })

  it('keeps the usual one-tap rule when the person’s settled name already is the series’', () => {
    const v = viewOf(push({ suggestion: settled('video stream') }))

    expect(v.hint?.kind).toBe('series')
    // The votes' category stays: the series fills nothing the history already decided.
    expect(v).toMatchObject({ description: 'video stream', categoryId: 1, fromHistory: true, oneTap: true })
  })
})

describe('a push the series ask about', () => {
  it('asks about a rename, showing the series’ current name rather than the old one', () => {
    const v = viewOf(push({ suggestion: settled('Old Stream') }))

    expect(v.hint).toMatchObject({ kind: 'renamed', votedDescription: 'Old Stream' })
    expect(v).toMatchObject({ description: 'Video Stream', categoryId: 2, oneTap: false })
  })

  it('asks whether a series paid from another account moved, keeping the push’s own account', () => {
    const v = viewOf(push({ accountId: 2 }))

    expect(v.hint).toMatchObject({ kind: 'moved', pushAccountId: 2 })
    expect(v).toMatchObject({ description: 'Video Stream', accountId: 2, accountName: 'Travel Credit', oneTap: false })
    expect(v.hintAccount).toBe('Main Debit')
  })

  it('never adds by one tap a payment whose series is paid from another account, even under the name it already has', () => {
    const v = viewOf(push({ accountId: 2, suggestion: { ...settled('Video Stream'), categoryId: 2, accountId: 2 } }))

    expect(v.hint).toMatchObject({ kind: 'moved' })
    // Nothing else is in doubt: the name is the series' own, so no field was filled from it.
    expect(v).toMatchObject({ filled: false, reasons: [], oneTap: false })
    expect(transactionOf(v)).toBeNull()
    expect(rowNote(v, 'card', '2026-11-11')).toEqual({ text: 'Check the account', tone: 'need' })
    expect(rowButton(v)).toBe('review')
  })

  it('says in the review view what the series asks: moved, renamed, and the monthly payment it looks like', () => {
    const moved = viewOf(push({ accountId: 2 }))
    expect(whyReasons(moved, undefined, '2026-11-11')).toContain(
      'you pay Video Stream from Main Debit, so it may have moved',
    )
    expect(introNotes(moved)).toEqual([{ text: 'Looks like your monthly Video Stream, due 10\u00a0Nov.', warn: false }])

    const renamed = viewOf(push({ suggestion: settled('Old Stream') }))
    expect(whyReasons(renamed, undefined, '2026-11-11')).toContain(
      'you added it as Old Stream before, so it may have been renamed',
    )

    // A push that names no account: the series' account is in the fields, and the line names it too.
    const plain = viewOf(push({ accountId: null }))
    expect(plain.hint).toMatchObject({ kind: 'series' })
    expect(introNotes(plain)).toEqual([
      { text: 'Looks like your monthly Video Stream, due 10\u00a0Nov, paid from Main Debit.', warn: false },
    ])
    expect(introNotes(viewOf(push()))).toEqual([
      { text: 'Looks like your monthly Video Stream, due 10\u00a0Nov.', warn: false },
    ])
  })

  it('has no line about a monthly payment without one, or for two that fit, which the form asks about itself', () => {
    expect(introNotes(viewOf(makeRecommendation({ merchantRaw: 'TIENDA EJEMPLO' })))).toEqual([])
    const two = viewOf(push({ amountCents: 999, localDate: '2026-11-14' }))
    expect(two.hint).toMatchObject({ kind: 'choose' })
    expect(introNotes(two)).toEqual([])
  })

  it('says what the bank wrote for an amount not in euros, and nothing when there is no amount', () => {
    const foreign = viewOf(makeRecommendation({ merchantRaw: 'TIENDA EJEMPLO', currency: 'USD', amountCents: 1820 }))
    expect(introNotes(foreign)).toEqual([
      { text: 'The message says US$18.20. Type the amount in euros your bank charged.', warn: true },
    ])
    expect(
      introNotes(viewOf(makeRecommendation({ merchantRaw: 'TIENDA EJEMPLO', currency: 'USD', amountCents: null }))),
    ).toEqual([])
  })

  it('offers two series side by side and fills from neither', () => {
    const v = viewOf(push({ amountCents: 999, localDate: '2026-11-14' }))

    expect(v.hint?.kind).toBe('choose')
    expect(v.hint?.kind === 'choose' && v.hint.series.map((s) => s.description).sort()).toEqual([
      'Cloud Box',
      'Music Plan',
    ])
    expect(v).toMatchObject({ description: 'PAYPROC*XY', categoryId: null, hintAccount: null, oneTap: false })
    expect(v.reasons).toContain('new-merchant')
  })

  it('never lets settled votes pick one of two series by a tap, even when they name one of them', () => {
    for (const name of ['Coffee Club', 'Music Plan']) {
      const v = viewOf(
        push({ amountCents: 999, localDate: '2026-11-14', suggestion: { ...settled(name), amountCents: 999 } }),
      )

      expect(v.hint?.kind).toBe('choose')
      expect(v).toMatchObject({ description: name, reasons: [], oneTap: false })
      expect(transactionOf(v)).toBeNull()
    }
  })
})

describe('the series the match reads', () => {
  it('reads the whole history’s series when the model holds only some rows', () => {
    const windowed: ExpenseModel = {
      ...model,
      dataset: { ...model.dataset, transactions: [] },
      sums: model.dataset,
      history: { groups: groupTransactions(model.dataset.transactions) },
    }

    expect(viewOf(push(), windowed).hint?.kind).toBe('series')
  })

  it('offers nothing while such a model waits for its history, as the recurring card does', () => {
    const waiting: ExpenseModel = { ...model, sums: model.dataset }

    expect(seriesHintsOf([push()], waiting, merchants, {}).size).toBe(0)
  })

  it('leaves out a series the person stopped', () => {
    const group = groupTransactions(model.dataset.transactions).find((g) => g.label === 'Video Stream')!
    const stopped = { [groupKeyString(group.key)]: { after: '2026-10-10' } }

    expect(seriesHintsOf([push()], model, merchants, stopped).get(push().id)).toEqual({ kind: 'none' })
  })
})
