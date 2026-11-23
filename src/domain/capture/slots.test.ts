import { describe, expect, it } from 'vitest'
import { currencyAmount, readPushSlots, readSlots } from './slots'
import type { NumberSlot, Slot } from './slots'

const numbers = (slots: Slot[]) => slots.filter((s): s is NumberSlot => s.kind === 'number')
const cents = (slot: NumberSlot | undefined) => slot?.candidates.map((c) => c.cents)

describe('readSlots, amounts', () => {
  it('reads a purchase with a comma amount and masked card digits', () => {
    const slots = readSlots(
      'Has hecho una compra de 12,34 EUR en EXAMPLE SHOP con tu tarjeta Example Card terminada *0000',
    )
    expect(slots).toEqual([
      {
        kind: 'number',
        index: 5,
        raw: '12,34',
        candidates: [{ cents: 1234, mark: 'comma' }],
        currency: 'EUR',
        negative: false,
      },
      { kind: 'masked-digits', index: 16, digits: '0000' },
    ])
  })

  it('reads a dot amount and the two-star spelling of the card', () => {
    const slots = readSlots('Se ha realizado una retención de 4.54 EUR en EXAMPLE con tu tarjeta **0000.')
    expect(numbers(slots).map((s) => [cents(s), s.currency])).toEqual([[[454], 'EUR']])
    expect(slots.filter((s) => s.kind === 'masked-digits')).toEqual([
      { kind: 'masked-digits', index: 13, digits: '0000' },
    ])
  })

  it('takes a minus on the number as a cue and never as a sign on the amount', () => {
    const [slot] = numbers(readSlots('Ha habido un movimiento de -50.0 EUR en tu cuenta **0000.'))
    expect(slot).toMatchObject({ raw: '-50.0', negative: true, currency: 'EUR' })
    expect(cents(slot)).toEqual([5000])
  })

  it('takes a minus standing alone before the number', () => {
    const [slot] = numbers(readSlots('Cargo de - 12,50 EUR'))
    expect(slot).toMatchObject({ negative: true, currency: 'EUR' })
    expect(cents(slot)).toEqual([1250])
  })

  it('reads a marker glued to the number, and the code that follows it', () => {
    const slots = readSlots('has realizado una retirada de efectivo de 50,00EUR en el cajero 0000')
    expect(numbers(slots).map((s) => [cents(s), s.currency])).toEqual([[[5000], 'EUR']])
    expect(slots.filter((s) => s.kind === 'code')).toEqual([{ kind: 'code', index: 11 }])
  })

  it('reads thousands in both spellings with the marker on either side', () => {
    expect(numbers(readSlots('Compra de 1.234,56 EUR en Tienda Ejemplo')).map(cents)).toEqual([[123456]])
    const dollars = numbers(readSlots('Payment of $1,234.56 at EXAMPLE on 20/11/2026'))
    expect(dollars.map((s) => [cents(s), s.currency])).toEqual([[[123456], 'USD']])
    const euros = numbers(readSlots('Zahlung 12,50 € bei BEISPIEL'))
    expect(euros.map((s) => [cents(s), s.currency])).toEqual([[[1250], 'EUR']])
  })

  it('reads a marker before the number, glued or apart', () => {
    expect(numbers(readSlots('Total €12')).map((s) => [cents(s), s.currency])).toEqual([[[1200], 'EUR']])
    expect(numbers(readSlots('Total EUR 12,00')).map((s) => [cents(s), s.currency])).toEqual([[[1200], 'EUR']])
    expect(numbers(readSlots('Total 12€.')).map((s) => [cents(s), s.currency])).toEqual([[[1200], 'EUR']])
    expect(numbers(readSlots('Total (12,00 EUR).')).map((s) => [cents(s), s.currency])).toEqual([[[1200], 'EUR']])
  })

  it('gives a marker to one number only: the one before it, else the one after', () => {
    const slots = numbers(readSlots('Compra 12,50 EUR 3 items'))
    expect(slots.map((s) => [s.raw, s.currency])).toEqual([
      ['12,50', 'EUR'],
      ['3', null],
    ])
    expect(currencyAmount(readSlots('Compra 12,50 EUR 3 items'))).toMatchObject({
      raw: '12,50',
      candidates: [{ cents: 1250 }],
    })
    expect(numbers(readSlots('Total EUR 12,50 y 3 items')).map((s) => [s.raw, s.currency])).toEqual([
      ['12,50', 'EUR'],
      ['3', null],
    ])
    expect(numbers(readSlots('3 items EUR 12,50')).map((s) => [s.raw, s.currency])).toEqual([
      ['3', null],
      ['12,50', 'EUR'],
    ])
    expect(numbers(readSlots('Son 5 EUR 12,50')).map((s) => [s.raw, s.currency])).toEqual([
      ['5', 'EUR'],
      ['12,50', null],
    ])
  })

  it('does not lend a marker glued to one number to its neighbour', () => {
    expect(numbers(readSlots('Pago 12€ y 3 items')).map((s) => [s.raw, s.currency])).toEqual([
      ['12€', 'EUR'],
      ['3', null],
    ])
  })

  it('says when the currency is a guess from a symbol several currencies share', () => {
    const [dollar, euro, plain] = numbers(readSlots('Pago $12,00 y 5,00 € y 7 kr y 3'))
    expect(dollar).toMatchObject({ currency: 'USD', currencyGuess: true })
    expect(euro?.currencyGuess).toBeUndefined()
    expect(numbers(readSlots('Pago 7 kr'))[0]).toMatchObject({ currency: 'SEK', currencyGuess: true })
    expect(numbers(readSlots('Pago 7 EUR'))[0]).not.toHaveProperty('currencyGuess')
    expect(plain).toBeDefined()
  })

  it('keeps an ambiguous thousands tail with its flag', () => {
    const [slot] = numbers(readSlots('Compra de 1.234 EUR'))
    expect(slot?.candidates).toEqual([{ cents: 123400, mark: 'comma', ambiguous: true }])
  })

  it('keeps a number with no marker, and a number over the cap with no candidate', () => {
    const slots = numbers(readSlots('Quedan 3 intentos y 123456789012 puntos'))
    expect(slots.map((s) => [s.raw, s.currency, cents(s)])).toEqual([
      ['3', null, [300]],
      ['123456789012', null, []],
    ])
  })

  it('does not take a word that is also a currency code for a currency', () => {
    expect(numbers(readSlots('all 5 items')).map((s) => s.currency)).toEqual([null])
  })

  it('leaves tokens that only look numeric alone', () => {
    expect(readSlots('ref12 12km €12km 09:41 #5 10%')).toEqual([])
  })

  it('finds nothing in a text with no numbers, or no text', () => {
    expect(readSlots('Compra realizada en tienda')).toEqual([])
    expect(readSlots('   ')).toEqual([])
  })
})

describe('readSlots, masked digits', () => {
  it.each([
    'card **1234',
    'card *1234',
    'card ····1234',
    'card …1234',
    'card ****1234.',
    'card (*1234)',
    'card ...1234',
    'card •••• 1234',
    'card ending 1234',
    'card Ending 1234.',
  ])('reads the card in %j', (text) => {
    expect(readSlots(text)).toEqual([{ kind: 'masked-digits', index: text.split(' ').length - 1, digits: '1234' }])
  })

  it('does not take part of a longer number, or four digits with nothing before them', () => {
    expect(readSlots('ref *123456').filter((s) => s.kind === 'masked-digits')).toEqual([])
    expect(readSlots('card 1234').map((s) => s.kind)).toEqual(['code'])
    expect(readSlots('1234').map((s) => s.kind)).toEqual(['code'])
  })

  it('finds every occurrence with its position', () => {
    const slots = readSlots('de *1111 a **2222')
    expect(slots).toEqual([
      { kind: 'masked-digits', index: 1, digits: '1111' },
      { kind: 'masked-digits', index: 3, digits: '2222' },
    ])
  })
})

describe('readSlots, dates', () => {
  it.each(['2026-11-20', '20/11/2026', '20-11-2026', '20.11.2026', '20/11/2026.', '(20/11/2026)', '5/1/2026'])(
    'reads %s as a date',
    (token) => {
      const [slot] = readSlots(`el ${token}`)
      expect(slot?.kind).toBe('date')
      expect(slot).toMatchObject({ index: 1, iso: token.startsWith('5/') ? '2026-01-05' : '2026-11-20' })
    },
  )

  it.each(['31/13/2026', '2026-13-01', '32/01/2026', '29/02/2027', '00/01/2026', '01/01/1800', '1/1/26'])(
    'rejects %s',
    (token) => {
      expect(readSlots(`el ${token}`).filter((s) => s.kind === 'date')).toEqual([])
    },
  )

  it('flags a date whose day and month could be swapped, and no other', () => {
    expect(readSlots('03/04/2026')).toEqual([{ kind: 'date', index: 0, iso: '2026-04-03', ambiguous: true }])
    expect(readSlots('12-01-2026')).toEqual([{ kind: 'date', index: 0, iso: '2026-01-12', ambiguous: true }])
    expect(readSlots('20/11/2026')).toEqual([{ kind: 'date', index: 0, iso: '2026-11-20' }])
    expect(readSlots('13/01/2026')).toEqual([{ kind: 'date', index: 0, iso: '2026-01-13' }])
    expect(readSlots('05/05/2026')).toEqual([{ kind: 'date', index: 0, iso: '2026-05-05' }])
    expect(readSlots('2026-04-03')).toEqual([{ kind: 'date', index: 0, iso: '2026-04-03' }])
  })

  it('accepts a leap day', () => {
    expect(readSlots('29/02/2028')).toEqual([{ kind: 'date', index: 0, iso: '2028-02-29' }])
  })

  it('leaves a rejected date as a number that carries no amount', () => {
    const [slot] = readSlots('31.13.2026')
    expect(slot).toMatchObject({ kind: 'number', candidates: [] })
  })
})

describe('readSlots, codes', () => {
  it('reads a bare run of four to eight digits as a code', () => {
    expect(readSlots('Tu código es 481516')).toEqual([{ kind: 'code', index: 3 }])
    expect(readSlots('code 1234 and 12345678').map((s) => s.kind)).toEqual(['code', 'code'])
  })

  it('does not read three digits, nine digits, a signed run or a marked one as a code', () => {
    expect(readSlots('123')[0]?.kind).toBe('number')
    expect(readSlots('123456789')[0]?.kind).toBe('number')
    expect(readSlots('-1234')[0]?.kind).toBe('number')
    expect(readSlots('1500 EUR')[0]).toMatchObject({ kind: 'number', currency: 'EUR' })
    expect(readSlots('1500EUR')[0]).toMatchObject({ kind: 'number', currency: 'EUR' })
  })
})

describe('readPushSlots', () => {
  it('reads title and body as one text', () => {
    const slots = readPushSlots('Compra 12,34 EUR', 'en tienda **0000')
    expect(slots.map((s) => [s.kind, s.index])).toEqual([
      ['number', 1],
      ['masked-digits', 5],
    ])
  })
})

describe('currencyAmount', () => {
  const amount = (text: string) => currencyAmount(readSlots(text))

  it('is the one number with a marker', () => {
    expect(amount('Compra de 12,34 EUR, saldo 99')).toMatchObject({ raw: '12,34' })
  })
  it('is the first when two marked amounts read the same cents', () => {
    expect(amount('Cargo 12,34 EUR, importe 12.34 EUR')).toMatchObject({ index: 1 })
  })
  it('is none when two marked amounts differ', () => {
    expect(amount('Cargo 12,34 EUR, saldo 99,00 EUR')).toBeNull()
  })
  it('is none when no number carries a marker, or a marked one has no reading', () => {
    expect(amount('Tu código es 481516 y son 12,34')).toBeNull()
    expect(amount('')).toBeNull()
    expect(amount('A 1.2.3 EUR y 12,34 EUR')).toBeNull()
  })
  it('keeps the only marked number even when it has no reading', () => {
    expect(amount('Son 1.2.3 EUR')).toMatchObject({ candidates: [] })
  })
})
