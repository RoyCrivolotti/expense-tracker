import { describe, expect, it } from 'vitest'
import { interpretPush } from './interpret'
import { pairBalanceAlerts } from './pairing'
import type { KindRule, RawPush } from './types'

const received = Date.UTC(2026, 10, 3, 9, 42)
const purchase: RawPush = {
  source: 'iberia',
  title: 'Compra realizada',
  body: 'Shop Example *4321 33,40 EUR',
  date: '2026-11-03T09:41:07+01:00',
}

const bizumRule: KindRule = {
  source: 'santander', title: 'Bizum test', kind: 'bizum-received', mark: 'dot', keepsText: false, bareAmount: true,
}
const cashRule: KindRule = {
  source: 'santander', title: 'Cash test', kind: 'cash-withdrawal', mark: 'dot', keepsText: false, bareAmount: true,
}

describe('interpretPush', () => {
  it('turns a purchase push into a recommendation suggested as an expense', () => {
    expect(interpretPush(purchase, received)).toEqual({
      outcome: 'recommend',
      kind: 'card-purchase',
      suggestedType: 'expense',
      amountCents: 3340,
      signedCents: -3340,
      bankWroteMinus: false,
      lastFour: '4321',
      instantMs: Date.UTC(2026, 10, 3, 8, 41, 7),
      localDate: '2026-11-03',
      rawText: 'Shop Example *4321 33,40 EUR',
    })
  })

  it('marks a purchase incomplete rather than guessing when the amount does not parse', () => {
    const result = interpretPush({ ...purchase, body: 'Shop Example *4321 amount hidden' }, received)
    expect(result).toMatchObject({ outcome: 'recommend', amountCents: null, signedCents: null })
  })

  it('does not read a dot-decimal amount the comma way', () => {
    const result = interpretPush({ ...purchase, body: 'Shop 345.0 EUR' }, received)
    expect(result).toMatchObject({ amountCents: null })
  })

  it('drops an unrecognised push and keeps only its source and day', () => {
    const push = { ...purchase, title: 'Your code is 481516', body: 'Do not share 481516' }
    const result = interpretPush(push, received)
    expect(result).toEqual({ outcome: 'dropped', source: 'iberia', localDate: '2026-11-03' })
    expect(JSON.stringify(result)).not.toMatch(/481516|code/i)
  })

  it('still counts a dropped push whose Date is unreadable', () => {
    const result = interpretPush({ ...purchase, title: 'Other', date: 'garbage' }, received)
    expect(result).toEqual({ outcome: 'dropped', source: 'iberia', localDate: null })
  })

  it('lists a recognised push with an unreadable Date as unknown', () => {
    expect(interpretPush({ ...purchase, date: 'garbage' }, received)).toEqual({
      outcome: 'unknown', reason: 'bad-date', source: 'iberia',
    })
  })

  it('lists a recognised push dated far from the server clock as unknown', () => {
    const stale = { ...purchase, date: '2026-11-20T09:41:07+01:00' }
    expect(interpretPush(stale, received)).toMatchObject({ outcome: 'unknown', reason: 'clock-skew' })
  })

  it('keeps the local day when an offset puts UTC on the day before', () => {
    const result = interpretPush({ ...purchase, date: '2026-07-02T00:30:00+02:00' }, Date.UTC(2026, 6, 1, 22, 31))
    expect(result).toMatchObject({ localDate: '2026-07-02' })
  })

  it('stores the amount positive and records the sign separately', () => {
    const rules: KindRule[] = [{ ...bizumRule, source: 'iberia', title: 'Compra realizada', kind: 'transfer-sent', bareAmount: true }]
    const result = interpretPush({ ...purchase, body: 'sent -10.5' }, received, rules)
    expect(result).toMatchObject({ amountCents: 1050, bankWroteMinus: true, signedCents: -1050, suggestedType: 'expense' })
  })

  it('never keeps another person’s name from a Bizum or an ATM body', () => {
    const name = 'Zebediah Quillfeather'
    const bizum = interpretPush(
      { source: 'santander', title: 'Bizum test', body: `${name} sent you 4.0`, date: purchase.date },
      received, [bizumRule],
    )
    const cash = interpretPush(
      { source: 'santander', title: 'Cash test', body: `Holder ${name} took 50.0`, date: purchase.date },
      received, [cashRule],
    )
    expect(bizum).toMatchObject({ kind: 'bizum-received', suggestedType: 'income', amountCents: 400 })
    expect(cash).toMatchObject({ kind: 'cash-withdrawal', suggestedType: 'expense', amountCents: 5000 })
    for (const result of [bizum, cash]) {
      expect(JSON.stringify(result)).not.toContain('Zebediah')
      expect(result).not.toHaveProperty('rawText')
    }
  })

  it('gives a purchase the signed amount a balance alert is paired with', () => {
    const result = interpretPush(purchase, received)
    if (result.outcome !== 'recommend' || result.signedCents === null) throw new Error('expected a recommendation')
    const event = { id: 'e', account: '1', signedCents: result.signedCents, atMs: result.instantMs }
    const alert = { id: 'a', account: '1', signedCents: -3340, atMs: result.instantMs + 4000 }
    expect(pairBalanceAlerts([event], [alert]).pairs).toEqual([{ eventId: 'e', alertId: 'a' }])
  })

  it('gives an inflow kind a positive signed amount', () => {
    const result = interpretPush(
      { source: 'santander', title: 'Bizum test', body: 'got 4.0', date: purchase.date }, received, [bizumRule],
    )
    expect(result).toMatchObject({ signedCents: 400 })
  })
})
