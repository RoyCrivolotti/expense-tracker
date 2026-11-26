import { describe, expect, it } from 'vitest'
import { waitingTotals, wholeEuros, type CountedPayment } from './totals'

let n = 0
const pay = (
  amountCents: number | null,
  over: Partial<CountedPayment> = {},
): CountedPayment => ({ id: `p${++n}`, amountCents, currency: 'EUR', suggestedType: 'expense', ...over })

describe('what the waiting payments add up to', () => {
  it('adds money out and money in apart, every type on its side', () => {
    const totals = waitingTotals(
      [
        pay(340),
        pay(4380),
        pay(185000, { suggestedType: 'income' }),
        pay(2500, { suggestedType: 'refund' }),
        pay(40000, { suggestedType: 'investment' }),
      ],
      [],
    )
    expect(totals).toEqual({ inCents: 187500, outCents: 44720 })
  })

  it('is zero each way with nothing waiting, and zero on the side nothing moves on', () => {
    expect(waitingTotals([], [])).toEqual({ inCents: 0, outCents: 0 })
    expect(waitingTotals([pay(999)], [])).toEqual({ inCents: 0, outCents: 999 })
    expect(waitingTotals([pay(999, { suggestedType: 'income' })], [])).toEqual({ inCents: 999, outCents: 0 })
  })

  it('counts a bill waiting twice once: the announcement of a pair is left out, its charge stays', () => {
    const notice = pay(6215)
    const charge = pay(6215)
    const others = [pay(340), pay(1299)]
    expect(waitingTotals([notice, charge, ...others], []).outCents).toBe(6215 + 6215 + 340 + 1299)
    expect(waitingTotals([notice, charge, ...others], [{ announcement: notice.id, charge: charge.id }]).outCents).toBe(
      6215 + 340 + 1299,
    )
  })

  it('leaves out a payment not in euros, whatever its amount', () => {
    expect(waitingTotals([pay(1820, { currency: 'USD' }), pay(500)], [])).toEqual({ inCents: 0, outCents: 500 })
    expect(waitingTotals([pay(1820, { currency: 'GBP', suggestedType: 'income' })], [])).toEqual({
      inCents: 0,
      outCents: 0,
    })
    expect(waitingTotals([pay(700, { currency: null })], []).outCents).toBe(700)
  })

  it('leaves out a payment with no amount, and one whose direction is not known', () => {
    expect(waitingTotals([pay(null), pay(30000, { suggestedType: null }), pay(120)], [])).toEqual({
      inCents: 0,
      outCents: 120,
    })
  })

  it('holds six digits and more without losing a cent', () => {
    expect(
      waitingTotals([pay(12345678, { suggestedType: 'income' }), pay(25000000), pay(99999999), pay(1)], []),
    ).toEqual({ inCents: 12345678, outCents: 125000000 })
  })
})

describe('whole euros', () => {
  it('rounds at the half euro, upwards', () => {
    expect(wholeEuros(0)).toBe(0)
    expect(wholeEuros(49)).toBe(0)
    expect(wholeEuros(50)).toBe(1)
    expect(wholeEuros(149)).toBe(1)
    expect(wholeEuros(150)).toBe(2)
    expect(wholeEuros(17349)).toBe(173)
    expect(wholeEuros(17350)).toBe(174)
    expect(wholeEuros(12345678)).toBe(123457)
  })

  it('rounds the sum, not each payment: three of 0,40 are 1 euro, not 0', () => {
    expect(wholeEuros(waitingTotals([pay(40), pay(40), pay(40)], []).outCents)).toBe(1)
  })
})
