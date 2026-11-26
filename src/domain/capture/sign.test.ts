import { describe, expect, it } from 'vitest'
import { signedDirection } from './sign'
import { possibleMatchesFor } from './duplicate'
import { learnFromAccept, type TemplateFacts } from './learn'
import { readPush } from './readPush'
import { suggestFor } from './suggestion'

/*
 * One bank wording, used for money both ways: "a movement of 64,20 EUR" for money in and "a movement of -47,15 EUR"
 * for money out. Invented text of the same form as a real one. The reader gives both one skeleton, so one template.
 */
const TITLE = 'Your balance changed!'
const movement = (amount: string) =>
  readPush(TITLE, `There has been a movement of ${amount} EUR in your account **1234.`)

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

/** The wording after the person saved its unsigned push as income, as happened before this rule existed. */
function taughtIncome(): TemplateFacts {
  const unsigned = movement('64,20')
  return learnFromAccept(FRESH, unsigned.slots, { amountCents: 6420, type: 'income', accountId: 3 }, true)
}

const shownType = (
  amount: string,
  template: TemplateFacts | null,
  firstGuess: 'expense' | 'income' = 'expense',
) =>
  suggestFor(
    { amountCents: null, accountId: null, suggestedType: firstGuess, slots: movement(amount).slots },
    template,
    [],
  ).type

describe('the sign the bank wrote', () => {
  it('is read on the amount: a minus, a Unicode minus or a plus glued to it, or none', () => {
    const at = (amount: string) => signedDirection(movement(amount).slots, null)
    expect(at('-47,15')).toBe('out')
    expect(at('-47.15')).toBe('out')
    expect(at('−47,15')).toBe('out')
    expect(at('+47,15')).toBe('in')
    expect(at('47,15')).toBeNull()
    expect(at('47.15')).toBeNull()
    const marked = (body: string) => signedDirection(readPush(TITLE, body).slots, null)
    expect(marked('Paid €-47,15')).toBe('out')
    expect(marked('Received €+47,15')).toBe('in')
  })

  it('takes a dash or a plus standing apart from the number for a separator, not a sign', () => {
    const at = (amount: string) => signedDirection(movement(amount).slots, null)
    expect(at('- 47,15')).toBeNull()
    expect(at('+ 47.15')).toBeNull()
    expect(signedDirection(readPush('Bizum', 'Bizum recibido de Ana - 20,00 EUR').slots, null)).toBeNull()
  })

  it('gives every sign the same skeleton, so one wording stays one template', () => {
    const skeletons = new Set(['-47,15', '+47,15', '47,15', '−47.15'].map((a) => movement(a).skeleton))
    expect(skeletons.size).toBe(1)
  })

  it('is not read after the amount: such a push shows no amount at all, as before', () => {
    expect(movement('47,15-').currencyAmount).toBeNull()
    expect(readPush(TITLE, 'A movement of 47,15 EUR- in your account').currencyAmount).toBeNull()
  })

  it('reads the sign of the number the template learned, not of another number in the push', () => {
    const push = readPush(TITLE, 'Refund +12,00 EUR. Balance -50,00 EUR')
    const index = (raw: string) => push.slots.find((s) => s.kind === 'number' && s.raw === raw)!.index
    expect(signedDirection(push.slots, index('+12,00'))).toBe('in')
    expect(signedDirection(push.slots, index('-50,00'))).toBe('out')
    // With nothing learned, two marked amounts that differ are no amount, so there is no sign either.
    expect(signedDirection(push.slots, null)).toBeNull()
  })
})

describe('a sign beats what the wording learned', () => {
  it('shows a "-X" push of a wording learned as income as an expense', () => {
    const template = taughtIncome()
    expect(template.type).toBe('income')
    for (const amount of ['-47,15', '-47.15', '−47,15']) expect(shownType(amount, template)).toBe('expense')
  })

  it('keeps the learned type when a dash only separates the words from the amount', () => {
    const received = (amount: string) => readPush('Bizum', `Bizum recibido de Ana ${amount} EUR`)
    const taught = learnFromAccept(
      FRESH,
      received('20,00').slots,
      { amountCents: 2000, type: 'income', accountId: 3 },
      true,
    )
    const shown = (
      amount: string,
      template: TemplateFacts,
    ) =>
      suggestFor(
        { amountCents: null, accountId: null, suggestedType: 'expense', slots: received(amount).slots },
        template,
        [],
      ).type
    expect(shown('- 20,00', taught)).toBe('income')
    const refund = { ...taught, type: 'refund' }
    expect(shown('- 12,50', refund)).toBe('refund')
  })

  it('still shows the wording’s unsigned pushes as it learned', () => {
    expect(shownType('250,00', taughtIncome())).toBe('income')
  })

  it('shows a "+X" push as income, whatever the first guess or the wording learned', () => {
    expect(shownType('+47,15', null)).toBe('income')
    expect(shownType('+47,15', { ...FRESH, accepts: 1, type: 'expense' })).toBe('income')
  })

  it('keeps a learned type that agrees with the sign: an investment is money out, a refund money in', () => {
    expect(shownType('-47,15', { ...FRESH, accepts: 1, type: 'investment' })).toBe('investment')
    expect(shownType('+47,15', { ...FRESH, accepts: 1, type: 'refund' })).toBe('refund')
  })

  it('leaves an unsigned push to the wording and then the first guess', () => {
    expect(shownType('47,15', { ...FRESH, accepts: 1, type: 'income' })).toBe('income')
    expect(shownType('47,15', null)).toBe('expense')
  })
})

describe('what a decision on a signed push teaches the wording', () => {
  it('does not change the wording’s type: "+X" and "-X" are not votes for it', () => {
    const template = taughtIncome()
    const spent = learnFromAccept(
      template,
      movement('-47,15').slots,
      { amountCents: 4715, type: 'expense', accountId: 3 },
      true,
    )
    expect(spent.type).toBe('income')
    expect(spent.accepts).toBe(2)
    const gained = learnFromAccept(
      FRESH,
      movement('+50,00').slots,
      { amountCents: 5000, type: 'income', accountId: 3 },
      true,
    )
    expect(gained.type).toBeNull()
  })

  it('still learns the type from a push whose dash stands apart, so a correction teaches', () => {
    const corrected = learnFromAccept(
      { ...FRESH, accepts: 1, type: 'expense' },
      readPush('Bizum', 'Bizum recibido de Ana - 20,00 EUR').slots,
      { amountCents: 2000, type: 'income', accountId: 3 },
      true,
    )
    expect(corrected.type).toBe('income')
  })

  it('still learns the type from an unsigned push', () => {
    const learned = learnFromAccept(
      FRESH,
      movement('20,00').slots,
      { amountCents: 2000, type: 'refund', accountId: 3 },
      true,
    )
    expect(learned.type).toBe('refund')
  })
})

describe('a bill announced the day before, then charged', () => {
  // The person typed the bill by hand as an expense on the day the announcement names (24 Nov). The real charge
  // arrives the next morning in the movement wording, which an earlier unsigned push taught as income. A row saved
  // from the announcement's own card is offered too, through the list: `workers/capture/src/announcedBill.test.ts`.
  const saved = { id: 41, date: '2026-11-24', description: 'Example Utility', type: 'expense', amountCents: 4715 }

  const chargeAs = (template: TemplateFacts) => {
    const s = suggestFor(
      { amountCents: 4715, accountId: 3, suggestedType: 'expense', slots: movement('-47,15').slots },
      template,
      [],
    )
    return {
      id: 'charge',
      createdAt: '2026-11-24T02:50:00.000Z',
      localDate: '2026-11-24',
      amountCents: s.amountCents,
      currency: 'EUR',
      suggestedType: s.type,
    }
  }

  it('offers the hand-typed bill as the row the charge is already added as', () => {
    const matches = possibleMatchesFor([chargeAs(taughtIncome())], [saved])
    expect(matches.get('charge')).toMatchObject({
      transactionId: 41,
      description: 'Example Utility',
      date: '2026-11-24',
    })
  })

  it('makes no offer when the charge is read as money in, which is what the wording alone said', () => {
    const asIncome = { ...chargeAs(taughtIncome()), suggestedType: 'income' as const }
    expect(possibleMatchesFor([asIncome], [saved]).get('charge')).toBeNull()
  })

  it('offers it on the arrival day too, a day before the bank booked it', () => {
    const matches = possibleMatchesFor([chargeAs(taughtIncome())], [{ ...saved, date: '2026-11-23' }])
    expect(matches.get('charge')?.transactionId).toBe(41)
  })
})
