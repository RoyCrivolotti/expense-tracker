import { describe, expect, it } from 'vitest'
import { MAX_SIBLING_RUN, readPush, spanText } from '../../../src/domain/capture'
import type { CaptureTemplate } from '../../../src/domain/ports/captureRepository'
import { MAX_TEMPLATE_TEXT, decideTemplate, matchTemplate, mutes } from './templates'

const TITLE = 'Card payment'
const push = (merchant: string, amount = '12,50') => readPush(TITLE, `You paid ${amount} EUR at ${merchant} with your card **4821`)
const row = (templateId: string, skeleton: string, merchantStart: number | null = null): CaptureTemplate => ({
  ignoredAt: null,
  templateId,
  skeleton,
  merchantStart,
  merchantEnd: merchantStart === null ? null : merchantStart + 1,
})
const ids = () => {
  let n = 0
  return () => `t${++n}`
}

describe('matchTemplate', () => {
  it('takes a template with the same skeleton as it is, learning nothing', () => {
    const first = push('Example Cafe')
    const again = push('Example Cafe', '3,99')
    expect(matchTemplate([row('t1', first.skeleton)], again.skeletonTokens)).toEqual({
      decision: { kind: 'existing', templateId: 't1' },
      merchant: null,
    })
  })

  it('learns the merchant run from a sibling, and gives the new push its own run', () => {
    const first = push('Example Cafe')
    const second = push('Sample Books Ltd')
    const match = matchTemplate([row('t1', first.skeleton)], second.skeletonTokens)
    expect(match?.decision).toEqual({
      kind: 'existing',
      templateId: 't1',
      learnedRun: {
        start: 7,
        end: 8,
        skeleton: 'card payment you paid <N> <C> at <M> with your card <D>',
      },
    })
    expect(match?.merchant && spanText(second, match.merchant)).toBe('Sample Books Ltd')
  })

  it('joins a template whose merchant is known when the push differs exactly there', () => {
    const learned = row('t1', 'card payment you paid <N> <C> at <M> with your card <D>', 7)
    const third = push('Corner Shop')
    const match = matchTemplate([learned], third.skeletonTokens)
    expect(match?.decision).toEqual({ kind: 'existing', templateId: 't1' })
    expect(match?.merchant && spanText(third, match.merchant)).toBe('Corner Shop')
  })

  it('does not join a known template when the words differ somewhere else too', () => {
    const learned = row('t1', 'card payment you paid <N> <C> at <M> with your card <D>', 7)
    const other = readPush(TITLE, 'You paid 12,50 EUR at Corner Shop with your phone **4821')
    expect(matchTemplate([learned], other.skeletonTokens)).toBeNull()
  })

  it('finds nothing among texts that only look alike', () => {
    const first = push('Example Cafe')
    const unrelated = readPush(TITLE, 'Your statement is ready to view')
    expect(matchTemplate([row('t1', first.skeleton)], unrelated.skeletonTokens)).toBeNull()
    expect(matchTemplate([], first.skeletonTokens)).toBeNull()
  })

  it('does not pair a run longer than the cap', () => {
    const first = push('Example Cafe')
    const long = push(Array.from({ length: MAX_SIBLING_RUN + 1 }, (_, i) => `Word${'abcdefghij'[i]}`).join(' '))
    expect(matchTemplate([row('t1', first.skeleton)], long.skeletonTokens)).toBeNull()
  })

  it('takes the first row that pairs, in the order given (most recently seen first)', () => {
    const first = push('Example Cafe')
    const match = matchTemplate([row('t2', first.skeleton), row('t1', first.skeleton)], push('Other').skeletonTokens)
    expect(match?.decision.kind === 'existing' && match.decision.templateId).toBe('t2')
  })

  it('keeps a template’s words rather than grow it past the column', () => {
    const base = readPush(TITLE, 'x paid 1 EUR at with card').skeleton.length
    const filler = 'x'.repeat(MAX_TEMPLATE_TEXT - 2 - base + 1)
    const near = readPush(TITLE, `${filler} paid 1 EUR at A with card`)
    const sibling = readPush(TITLE, `${filler} paid 1 EUR at with card`)
    // The wildcard would add four characters to a row two short of the cap.
    expect(sibling.skeleton.length).toBe(MAX_TEMPLATE_TEXT - 2)
    const match = matchTemplate([row('t1', sibling.skeleton)], near.skeletonTokens)
    expect(match?.decision).toEqual({ kind: 'existing', templateId: 't1' })
  })
})

describe('decideTemplate', () => {
  it('makes a new template, with the masked title, when none matches', () => {
    const first = push('Example Cafe')
    expect(decideTemplate([], first, ids())).toEqual({
      decision: { kind: 'new', template: { templateId: 't1', title: 'card payment', skeleton: first.skeleton } },
      merchant: null,
    })
  })

  it('makes none for a push too long to keep as a template', () => {
    const long = readPush(TITLE, `Paid 1 EUR ${'word '.repeat(MAX_TEMPLATE_TEXT / 4)}`)
    expect(long.currencyAmount).not.toBeNull()
    expect(decideTemplate([], long, ids())).toEqual({ decision: { kind: 'none' }, merchant: null })
  })

  it('makes none for a push with no currency-marked amount, even one a template already matches', () => {
    const code = readPush(TITLE, 'Your code is 482913 for Example Cafe')
    expect(code.currencyAmount).toBeNull()
    expect(decideTemplate([], code, ids())).toEqual({ decision: { kind: 'none' }, merchant: null })
    expect(decideTemplate([row('t1', code.skeleton)], code, ids())).toEqual({ decision: { kind: 'none' }, merchant: null })
  })
})

describe('mutes', () => {
  const ignored = (skeleton: string, merchantStart: number | null = null) => ({ ...row('t1', skeleton, merchantStart), ignoredAt: '2026-11-02T10:00:00.000Z' })
  const wildcard = 'card payment you paid <N> <C> at <M> with your card <D>'

  it('mutes the same wording of an ignored template', () => {
    const first = push('Example Cafe')
    expect(mutes(ignored(first.skeleton), push('Example Cafe', '3,99').skeleton)).toBe(true)
  })

  it('mutes a sibling at the <M> of an ignored template that knows its merchant', () => {
    expect(mutes(ignored(wildcard, 7), push('Corner Shop').skeleton)).toBe(true)
  })

  it('does not mute another merchant of an ignored template that has not learned where its merchant is', () => {
    expect(mutes(ignored(push('Example Cafe').skeleton), push('Sample Books Ltd').skeleton)).toBe(false)
  })

  it('never mutes a template that is not ignored', () => {
    const first = push('Example Cafe')
    expect(mutes(row('t1', first.skeleton), first.skeleton)).toBe(false)
  })
})
