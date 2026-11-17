import { describe, expect, it } from 'vitest'
import { IGNORE_AFTER_DISMISSALS, chooseAmountSlot, learnFromAccept, learnFromDismiss, outcomeOf, pushHadDigits, storedSlots } from './learn'
import type { SavedRow, TemplateFacts } from './learn'
import { readPushSlots } from './slots'
import type { Slot } from './slots'

const FRESH: TemplateFacts = {
  accepts: 0,
  dismissals: 0,
  dismissStreak: 0,
  amountSlot: null,
  amountMark: null,
  type: null,
  accountId: null,
  ignoredAt: null,
}
const NOW = '2026-03-02T09:00:00.000Z'
const slots = (body: string): Slot[] => readPushSlots('Card payment', body)
const SAVED = { amountCents: 3340, type: 'expense', accountId: 4 }

describe('chooseAmountSlot', () => {
  it('picks the one number slot that reads the saved amount, with the mark that reading assumed', () => {
    expect(chooseAmountSlot(slots('You paid 33,40 EUR at Example Shop, balance 1.020,00 EUR'), 3340)).toEqual({ index: 4, mark: 'comma' })
    expect(chooseAmountSlot(slots('You paid 12.50 at Example Shop'), 1250)).toEqual({ index: 4, mark: 'dot' })
  })

  it('compares without the sign, so a negative saved amount still finds its slot', () => {
    expect(chooseAmountSlot(slots('You paid 33,40 EUR'), -3340)).toEqual({ index: 4, mark: 'comma' })
  })

  it('answers nothing when no slot reads the amount', () => {
    expect(chooseAmountSlot(slots('You paid 33,40 EUR'), 3341)).toBeNull()
    expect(chooseAmountSlot(slots('No numbers at all'), 3340)).toBeNull()
  })

  it('answers nothing when two slots read the same cents, rather than guess', () => {
    expect(chooseAmountSlot(slots('You paid 10,00 EUR, of a limit of 10,00 EUR'), 1000)).toBeNull()
  })

  it('answers nothing when one slot has two readings of the same cents', () => {
    const twice: Slot[] = [
      { kind: 'number', index: 2, raw: '1.234', currency: null, negative: false, candidates: [{ cents: 123400, mark: 'comma' }, { cents: 123400, mark: 'none' }] },
    ]
    expect(chooseAmountSlot(twice, 123400)).toBeNull()
  })

  it('ignores slots that are not numbers, and a number slot stored without candidates', () => {
    const odd = [{ kind: 'masked-digits', index: 1, digits: '3340' }, { kind: 'number', index: 3 }] as unknown as Slot[]
    expect(chooseAmountSlot(odd, 3340)).toBeNull()
  })
})

describe('learnFromAccept', () => {
  it('counts the accept, learns slot, mark and type, and ends the streak', () => {
    const learned = learnFromAccept({ ...FRESH, dismissals: 2, dismissStreak: 2 }, slots('You paid 33,40 EUR'), SAVED, true)
    expect(learned).toEqual({ ...FRESH, accepts: 1, dismissals: 2, dismissStreak: 0, amountSlot: 4, amountMark: 'comma', type: 'expense' })
  })

  it('keeps the slot it had when the saved amount matches no reading', () => {
    const before = { ...FRESH, accepts: 1, amountSlot: 4, amountMark: 'comma' as const, type: 'expense' }
    const learned = learnFromAccept(before, slots('You paid 33,40 EUR'), { ...SAVED, amountCents: 3000, type: 'refund' }, true)
    expect(learned).toMatchObject({ accepts: 2, amountSlot: 4, amountMark: 'comma', type: 'refund' })
  })

  it('keeps the slot it had on a tie', () => {
    const before = { ...FRESH, amountSlot: 9, amountMark: 'dot' as const }
    const learned = learnFromAccept(before, slots('You paid 10,00 EUR of 10,00 EUR'), { ...SAVED, amountCents: 1000 }, false)
    expect(learned).toMatchObject({ amountSlot: 9, amountMark: 'dot' })
  })

  it('learns the account only from a push with no card digits', () => {
    expect(learnFromAccept(FRESH, [], SAVED, false).accountId).toBe(4)
    expect(learnFromAccept({ ...FRESH, accountId: 2 }, [], SAVED, true).accountId).toBe(2)
  })

  it('brings an ignored template back', () => {
    expect(learnFromAccept({ ...FRESH, ignoredAt: NOW, dismissStreak: 3 }, [], SAVED, false)).toMatchObject({ ignoredAt: null, dismissStreak: 0 })
  })
})

describe('learnFromDismiss', () => {
  const dismissTimes = (n: number, from: TemplateFacts = FRESH) => {
    let facts = from
    for (let i = 0; i < n; i++) facts = learnFromDismiss(facts, NOW)
    return facts
  }

  it('counts the dismissal and the streak', () => {
    expect(learnFromDismiss(FRESH, NOW)).toEqual({ ...FRESH, dismissals: 1, dismissStreak: 1 })
  })

  it(`ignores a template at ${IGNORE_AFTER_DISMISSALS} dismissals in a row, not before`, () => {
    expect(dismissTimes(IGNORE_AFTER_DISMISSALS - 1).ignoredAt).toBeNull()
    expect(dismissTimes(IGNORE_AFTER_DISMISSALS)).toMatchObject({ dismissals: 3, dismissStreak: 3, ignoredAt: NOW })
  })

  it('keeps the first ignore time on later dismissals', () => {
    expect(learnFromDismiss(dismissTimes(3), '2026-04-01T00:00:00.000Z').ignoredAt).toBe(NOW)
  })

  it('starts the streak again after an accept', () => {
    const accepted = learnFromAccept(dismissTimes(2), [], SAVED, false)
    expect(dismissTimes(2, accepted)).toMatchObject({ dismissStreak: 2, ignoredAt: null })
  })

  it('never ignores a template the person has accepted once', () => {
    const accepted = learnFromAccept(FRESH, [], SAVED, false)
    expect(dismissTimes(10, accepted)).toMatchObject({ dismissStreak: 10, ignoredAt: null })
  })
})

describe('outcomeOf', () => {
  const shown = { amountCents: 3340, suggestedType: 'expense', accountId: 4 }
  const saved: SavedRow = { amountCents: 3340, type: 'expense', accountId: 4 }

  it('is added-as-is when amount, type and account are the ones shown', () => {
    expect(outcomeOf(shown, saved)).toBe('added-as-is')
  })

  it('compares the amount without its sign, so an investment taken back out matches', () => {
    expect(outcomeOf({ ...shown, suggestedType: 'investment' }, { ...saved, type: 'investment', amountCents: -3340 })).toBe('added-as-is')
  })

  it('names each field the person changed, in a fixed order', () => {
    expect(outcomeOf(shown, { ...saved, amountCents: 3000 })).toBe('edited:amount')
    expect(outcomeOf(shown, { amountCents: 1, type: 'refund', accountId: 5 })).toBe('edited:amount,type,account')
  })

  it('counts a field the recommendation left empty as changed', () => {
    expect(outcomeOf({ amountCents: null, suggestedType: null, accountId: null }, saved)).toBe('edited:amount,type,account')
  })

  it('is linked or dismissed for those decisions', () => {
    expect(outcomeOf(shown, 'linked')).toBe('linked')
    expect(outcomeOf(shown, 'dismissed')).toBe('dismissed')
  })
})

describe('pushHadDigits', () => {
  const masked: Slot[] = [{ kind: 'masked-digits', index: 3, digits: '4321' }]

  it('is true for stored card digits, or a masked-digits slot, alone or together', () => {
    expect(pushHadDigits('4321', [])).toBe(true)
    expect(pushHadDigits(null, masked)).toBe(true)
    expect(pushHadDigits('4321', masked)).toBe(true)
  })

  it('is false with neither', () => {
    expect(pushHadDigits(null, slots('You paid 33,40 EUR'))).toBe(false)
  })
})

describe('storedSlots', () => {
  it('reads the stored list, and treats anything else as no slots', () => {
    expect(storedSlots('[{"kind":"code","index":3}]')).toEqual([{ kind: 'code', index: 3 }])
    expect(storedSlots(null)).toEqual([])
    expect(storedSlots('{"kind":"code"}')).toEqual([])
    expect(storedSlots('not json')).toEqual([])
  })
})
