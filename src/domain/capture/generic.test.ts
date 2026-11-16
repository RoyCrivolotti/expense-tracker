import { describe, expect, it } from 'vitest'
import { findAmountAnyMark } from './amount'
import { findDueDay, findMerchant, readGeneric } from './generic'
import { interpretPush } from './interpret'
import type { RawPush } from './types'

// Every body below is invented in the shape of a real one. Never put a real amount, merchant or digits in this file.
const HOLD = 'Se ha realizado una retención de 12.34 EUR en EXAMPLE SHOP con tu tarjeta **0000. Puedes entrar en tu App para ver el detalle.'
const RECEIPT = 'El 2026-11-20 se cargará el recibo de 40 EUR emitido por Example Energy, en tu cuenta **0000. Pulsa aquí para ver el detalle.'
const received = Date.UTC(2026, 10, 16, 9, 0)
const push = (over: Partial<RawPush>): RawPush => ({ source: 'newbank', title: 'Aviso', body: HOLD, date: '2026-11-16T09:41:07+01:00', ...over })

describe('a push no rule covers', () => {
  it('reads a card hold as an expense with its merchant and card, keeping the whole text beside it', () => {
    expect(interpretPush(push({ title: '⏸️ Retención en tu tarjeta' }), received)).toMatchObject({
      outcome: 'recommend',
      kind: 'card-hold',
      suggestedType: 'expense',
      amountCents: 1234,
      signedCents: -1234,
      lastFour: '0000',
      localDate: '2026-11-16',
      rawText: 'EXAMPLE SHOP',
      excerpt: HOLD,
    })
  })

  it('dates a scheduled charge by the day the bank names, though it is still ahead', () => {
    expect(interpretPush(push({ body: RECEIPT }), received)).toMatchObject({
      kind: 'scheduled-charge',
      suggestedType: 'expense',
      amountCents: 4000,
      localDate: '2026-11-20',
      rawText: 'Example Energy',
    })
  })

  it('keeps the push day when the named day is long past or far ahead', () => {
    for (const day of ['2026-11-01', '2027-05-20']) {
      expect(interpretPush(push({ body: RECEIPT.replace('2026-11-20', day) }), received)).toMatchObject({ localDate: '2026-11-16' })
    }
  })

  it('works for a bank that writes amounts with a comma and a thousands dot', () => {
    expect(interpretPush(push({ body: 'Compra de 1.234,56 EUR en Tienda Ejemplo con tu tarjeta *0000' }), received)).toMatchObject({
      kind: 'card-purchase',
      amountCents: 123456,
    })
  })

  it('keeps a push with an amount and no telling words as an unclassified expense for the person to look at', () => {
    expect(interpretPush(push({ body: 'Movimiento de 5 EUR en tu cuenta' }), received)).toMatchObject({ kind: 'unclassified', suggestedType: 'expense', amountCents: 500 })
  })

  it('reads money coming in as income and never keeps the text, which names the sender', () => {
    const result = interpretPush(push({ title: 'Bizum recibido', body: 'Has recibido 10 EUR de Persona Ejemplo' }), received)
    expect(result).toMatchObject({ kind: 'inflow', suggestedType: 'income', signedCents: 1000 })
    expect(result).not.toHaveProperty('rawText')
    expect(JSON.stringify(result)).not.toContain('Persona')
  })

  it('does not keep a transfer sent, whose text names the receiver', () => {
    const result = interpretPush(push({ body: 'Has enviado una transferencia de 30 EUR a Persona Ejemplo' }), received)
    expect(result).toMatchObject({ outcome: 'recommend', suggestedType: 'expense' })
    expect(result).not.toHaveProperty('rawText')
  })

  it.each([
    ['an offer', 'Oferta: financia tu compra hasta 5.000 EUR', 'promotional'],
    ['a promotion with a discount', 'Descuento de 10 EUR en tu próxima compra', 'promotional'],
    ['a released hold', 'Se ha liberado la retención de 12,34 EUR en EXAMPLE SHOP', 'promotional'],
    ['a push with no amount', 'Tienes un mensaje nuevo en tu buzón', 'no-amount'],
    ['a code', 'Tu código es 481516. No lo compartas.', 'no-amount'],
    ['an amount with no currency', 'Compra de 12 en Tienda Ejemplo', 'no-amount'],
    ['an amount in dollars', 'Compra de 12 USD en Tienda Ejemplo', 'no-amount'],
    ['two amounts that disagree', 'Compra de 12,00 EUR. Saldo disponible 340,00 EUR', 'no-amount'],
    ['a balance alert', 'Tu saldo es de 1.234,56 EUR', 'no-amount'],
  ])('drops %s', (_name, body, reason) => {
    expect(interpretPush(push({ body }), received)).toMatchObject({ outcome: 'dropped', reason })
  })

  it('lists a readable push with a bad date as unknown, and one dated far from the clock', () => {
    expect(interpretPush(push({ date: 'garbage' }), received)).toMatchObject({ outcome: 'unknown', reason: 'bad-date' })
    expect(interpretPush(push({ date: '2026-12-20T09:41:07+01:00' }), received)).toMatchObject({ outcome: 'unknown', reason: 'clock-skew' })
  })

  it('leaves a bank rule in charge of its own push', () => {
    const rule = interpretPush({ source: 'iberia', title: 'Compra realizada', body: 'Shop Example *4321 33,40 EUR', date: '2026-11-16T09:41:07+01:00' }, received)
    expect(rule).toMatchObject({ kind: 'card-purchase', rawText: 'Shop Example *4321 33,40 EUR' })
    expect(rule).not.toHaveProperty('excerpt')
  })
})

describe('findAmountAnyMark', () => {
  it.each([
    ['4.54 EUR', 454],
    ['33,40 EUR', 3340],
    ['1.234,56 EUR', 123456],
    ['40 EUR', 4000],
    ['€12,5', 1250],
  ])('reads %s as %i cents', (text, cents) => {
    expect(findAmountAnyMark(text)?.cents).toBe(cents)
  })

  it('gives null for a bare number and for two different amounts', () => {
    expect(findAmountAnyMark('pagaste 12')).toBeNull()
    expect(findAmountAnyMark('12,00 EUR y 13,00 EUR')).toBeNull()
  })
})

describe('findDueDay', () => {
  it.each([
    ['el 2026-11-20 se cargara', '2026-11-20'],
    ['el 20/11/2026 se cargara', '2026-11-20'],
    ['el 20 de noviembre de 2026', '2026-11-20'],
    ['el 20 de noviembre', '2026-11-20'],
    ['el 5 de enero', '2027-01-05'],
    ['el 31 de febrero', null],
    ['sin fecha', null],
  ])('reads %s', (text, day) => {
    expect(findDueDay(text, '2026-11-16')).toBe(day)
  })
})

describe('findMerchant', () => {
  it.each([
    ['Compra en Tienda Ejemplo con tu tarjeta **0000', 'Tienda Ejemplo'],
    ['Pago de 12,00 EUR en Cafe Uno, hoy', 'Cafe Uno'],
    ['recibo de 40 EUR emitido por Example Energy, en tu cuenta', 'Example Energy'],
    ['Compra de 5 EUR en tu cuenta', null],
    ['Tienes un mensaje', null],
  ])('finds the merchant in %s', (text, merchant) => {
    expect(findMerchant(text)).toBe(merchant)
  })
})

describe('readGeneric', () => {
  it('returns the cleaned text, without control characters', () => {
    const read = readGeneric('x', 'Compra\u0000 de 5 EUR en Tienda Ejemplo.', '2026-11-16')
    expect(read).toMatchObject({ outcome: 'read', text: 'Compra de 5 EUR en Tienda Ejemplo.' })
  })
})
