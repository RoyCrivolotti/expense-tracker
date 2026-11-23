import { describe, expect, it } from 'vitest'
import type { RecommendationInfo } from '../../data/recommendationsApi'
import { buildMerchantIndex } from '../../domain/capture/review'
import { groupKeyString, groupTransactions } from '../../domain/engine/recurringDetect'
import { makeRecommendation, makeSeriesModel } from '../../testing/reviewKit'
import type { ExpenseModel } from '../useExpenseData'
import { describeRecommendation, seedOf, transactionOf } from './reviewFields'
import { seriesHintsOf } from './reviewSeries'

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

  it('names the series’ account but leaves the card question to the person when the push showed an unlinked card', () => {
    const v = viewOf(push({ accountId: null, card: { source: 'bank', digits: '0000' } }))

    expect(v).toMatchObject({ description: 'Video Stream', accountId: null, askCard: { digits: '0000' } })
    expect(v.hintAccount).toBe('Main Debit')
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
