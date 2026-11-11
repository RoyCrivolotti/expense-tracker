import { describe, expect, it } from 'vitest'
import { findAmount, parseAmount } from './amount'

describe('parseAmount', () => {
  it.each([
    ['10.50', 'dot', 1050, false],
    ['-10.5', 'dot', 1050, true],
    ['4.0', 'dot', 400, false],
    ['345.0', 'dot', 34500, false],
    ['50,00EUR', 'comma', 5000, false],
    ['50,00 EUR', 'comma', 5000, false],
    ['12,5 €', 'comma', 1250, false],
    ['1.234,56', 'comma', 123456, false],
    ['7', 'dot', 700, false],
  ] as const)('reads %s with a %s decimal mark', (text, mark, cents, negative) => {
    expect(parseAmount(text, mark)).toEqual({ cents, negative })
  })

  it('refuses the other mark rather than reading 345.0 as 3,450', () => {
    expect(parseAmount('345.0', 'comma')).toBeNull()
    expect(parseAmount('12345.0', 'comma')).toBeNull()
    expect(parseAmount('50,00EUR', 'dot')).toBeNull()
  })

  it.each(['', 'abc', '10.505', '1,2,3', '--5', '10.50 dollars', '9'.repeat(30)])('refuses %j', (text) => {
    expect(parseAmount(text, 'dot')).toBeNull()
  })

  it('refuses a number too large to hold as exact cents', () => {
    expect(parseAmount(`${'9'.repeat(20)}.00`, 'dot')).toBeNull()
  })
})

describe('findAmount', () => {
  it('prefers a token with a currency over a bare number', () => {
    expect(findAmount('Order 12 paid 33,40 EUR on card', 'comma')).toEqual({ cents: 3340, negative: false })
  })

  it('refuses a bare number for a kind that does not write one', () => {
    expect(findAmount('Payment of 8.5 done', 'dot')).toBeNull()
    expect(findAmount('Compra en Tienda 24 con tarjeta *4321', 'comma')).toBeNull()
  })

  it('refuses several different currency tokens but accepts the same one repeated', () => {
    expect(findAmount('Paid 5,00 EUR of 9,00 EUR', 'comma')).toBeNull()
    expect(findAmount('Paid 5,00 EUR (5,00 EUR)', 'comma')).toEqual({ cents: 500, negative: false })
  })

  it('refuses several bare numbers even when bare is allowed', () => {
    expect(findAmount('Card 24 paid 8.5', 'dot', true)).toBeNull()
  })

  it('falls back to the one bare number when the kind allows it', () => {
    expect(findAmount('Payment of 8.5 done', 'dot', true)).toEqual({ cents: 850, negative: false })
  })

  it('keeps the sign of a signed amount', () => {
    expect(findAmount('Balance change -20.5 account', 'dot', true)).toEqual({ cents: 2050, negative: true })
  })

  it('ignores the digits of a masked card or account', () => {
    expect(findAmount('Card *1234 paid 5,00EUR', 'comma')).toEqual({ cents: 500, negative: false })
    expect(findAmount('Card •••• 1234', 'comma')).toBeNull()
  })

  it('accepts a full stop that ends a sentence', () => {
    expect(findAmount('You paid 9.99.', 'dot', true)).toEqual({ cents: 999, negative: false })
  })

  it('returns null when the wrong mark would have misread it', () => {
    expect(findAmount('Paid 345.0 today', 'comma')).toBeNull()
  })

  it('treats a prefix euro sign as a currency', () => {
    expect(findAmount('Order 12 paid €33,40', 'comma')).toEqual({ cents: 3340, negative: false })
  })

  it('refuses to pick between several bare numbers', () => {
    expect(findAmount('Card ending 4321 paid 5,00', 'comma')).toBeNull()
    expect(findAmount('13:50 Shop 33,40', 'comma', true)).toEqual({ cents: 3340, negative: false })
    expect(findAmount('Shop 7 items 33,40', 'comma')).toBeNull()
  })

  it('does not read a time as an amount', () => {
    expect(findAmount('At 13:50 you paid', 'comma')).toBeNull()
  })

  it('refuses zero and amounts beyond the cap', () => {
    expect(parseAmount('0,00', 'comma')).toBeNull()
    expect(parseAmount('-0,00', 'comma')).toBeNull()
    expect(parseAmount('9999999999.99', 'dot')).toBeNull()
    expect(parseAmount('1000000.00', 'dot')).toEqual({ cents: 100_000_000, negative: false })
    expect(parseAmount('1000000.01', 'dot')).toBeNull()
  })

  it('returns null when there is no number', () => {
    expect(findAmount('Hello there', 'dot')).toBeNull()
  })
})
