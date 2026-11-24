import { describe, expect, it } from 'vitest'
import { MESSAGE_DATE_WINDOW, messageDate } from './messageDate'
import { readPush } from './readPush'
import { tokenise } from './shape'

const ARRIVAL = '2026-11-23'
const dateIn = (
  text: string,
  arrival = ARRIVAL,
) => messageDate(tokenise(text), arrival)

describe('messageDate: the formats it reads', () => {
  it.each([
    ['ISO', 'On 2026-11-24 the bill of 47,15 EUR will be charged', '2026-11-24'],
    ['year first with slashes', 'Charge of 47,15 EUR on 2026/11/24', '2026-11-24'],
    ['day first with slashes', 'El 24/11/2026 se cargará el recibo de 47,15 EUR', '2026-11-24'],
    ['day first with dashes', 'Cargo 47,15 EUR el 24-11-2026', '2026-11-24'],
    ['day first with dots', 'Abbuchung 47,15 EUR am 24.11.2026.', '2026-11-24'],
    ['a two-digit year', 'Cargo de 47,15 EUR el 24/11/26', '2026-11-24'],
    ['a single-digit day and month', 'Cargo de 47,15 EUR el 2/12/2026', '2026-12-02'],
    ['day and month with no year', 'Cargo de 47,15 EUR el 24/11', '2026-11-24'],
    ['a Spanish month name', 'El 24 de noviembre de 2026 se cargará 47,15 EUR', '2026-11-24'],
    ['a Spanish month with no year', 'Se cargará 47,15 EUR el 24 de noviembre', '2026-11-24'],
    ['a Spanish short month', 'Recibo 47,15 EUR, cargo el 24 nov.', '2026-11-24'],
    ['an English month after the day', 'Your 47.15 EUR payment on 24 November 2026', '2026-11-24'],
    ['an English month before the day', 'Payment of 47.15 EUR due Nov 24, 2026', '2026-11-24'],
    ['an English ordinal with no year', 'Payment of 47.15 EUR on November 24th', '2026-11-24'],
    ['a month name in one word', 'Charge 47.15 EUR on 24-Nov-2026', '2026-11-24'],
    ['a month name in one word with no year', 'Charge 47.15 EUR on 24-nov', '2026-11-24'],
    ['an accented capitalised month', 'Cargo 47,15 EUR el 2 de DICIEMBRE', '2026-12-02'],
  ])('%s', (_name, text, date) => {
    expect(dateIn(text)).toBe(date)
  })

  it('reads a date in the title as well as the body', () => {
    expect(messageDate(readPush('Bill on 24/11/2026', 'The bill of 47,15 EUR is coming').tokens, ARRIVAL)).toBe(
      '2026-11-24',
    )
  })

  it('counts the same day written twice as one date', () => {
    expect(dateIn('On 24/11/2026 (24 Nov) we charge 47,15 EUR')).toBe('2026-11-24')
  })
})

describe('messageDate: the window around the arrival', () => {
  it('takes a date up to 7 days before and 10 after the arrival, and none further', () => {
    expect(MESSAGE_DATE_WINDOW).toEqual({ daysBack: 7, daysForward: 10 })
    expect(dateIn('Paid 5,00 EUR on 16/11/2026')).toBe('2026-11-16')
    expect(dateIn('Paid 5,00 EUR on 15/11/2026')).toBeNull()
    expect(dateIn('Charge of 5,00 EUR on 03/12/2026')).toBe('2026-12-03')
    expect(dateIn('Charge of 5,00 EUR on 04/12/2026')).toBeNull()
  })

  it('works across a month end and a year end, giving a yearless date the year nearest the arrival', () => {
    expect(dateIn('Cargo 5,00 EUR el 2/12', '2026-11-28')).toBe('2026-12-02')
    expect(dateIn('Cargo 5,00 EUR el 2/1', '2026-12-30')).toBe('2027-01-02')
    expect(dateIn('Paid 5,00 EUR on 30 Dec', '2027-01-02')).toBe('2026-12-30')
    expect(dateIn('Cargo 5,00 EUR el 31/12/2026', '2027-01-03')).toBe('2026-12-31')
  })

  it('reads 29 February only in a year that has one', () => {
    expect(dateIn('Cargo 5,00 EUR el 29/02/2028', '2028-02-27')).toBe('2028-02-29')
    expect(dateIn('Cargo 5,00 EUR el 29/02', '2028-02-27')).toBe('2028-02-29')
    expect(dateIn('Cargo 5,00 EUR el 29/02/2027', '2027-02-27')).toBeNull()
    expect(dateIn('Cargo 5,00 EUR el 29/02', '2027-02-27')).toBeNull()
  })

  it('measures from the phone’s own day, whatever its offset says about UTC', () => {
    // A push at 23:59 on the 23rd and one at 00:30 on the 24th, local time, about the same charge.
    expect(dateIn('Cargo 5,00 EUR el 24/11', '2026-11-23')).toBe('2026-11-24')
    expect(dateIn('Cargo 5,00 EUR el 24/11', '2026-11-24')).toBe('2026-11-24')
  })

  it('puts the right day on a payment whose phone clock is a day out', () => {
    expect(dateIn('Paid 5,00 EUR on 23/11/2026', '2026-11-24')).toBe('2026-11-23')
    expect(dateIn('Paid 5,00 EUR on 23/11/2026', '2026-11-22')).toBe('2026-11-23')
  })
})

describe('messageDate: day and month either way round', () => {
  it('uses the one order that lands in the window', () => {
    // 03/12 is 3 December (in the window) or 12 March (not).
    expect(dateIn('Cargo 5,00 EUR el 03/12/2026')).toBe('2026-12-03')
    // 11/24 has no 24th month, so it can only be month first.
    expect(dateIn('Charge of 5,00 EUR on 11/24/2026')).toBe('2026-11-24')
  })

  it('uses neither when neither order lands in the window', () => {
    // 3 April is 14 days ahead and 4 March 16 days back. The two orders of one date are always 27 days or more
    // apart (2 March and 3 February in a year with no 29 February), more than the window spans, so both can never
    // land in it.
    expect(dateIn('Cargo 5,00 EUR el 03/04/2026', '2026-03-20')).toBeNull()
  })

  it('reads a day and month with no year day first only, so a card expiry is never a day', () => {
    expect(dateIn('Card 11/26 charged 5,00 EUR', '2026-11-20')).toBeNull()
    expect(dateIn('Card 12/27 charged 5,00 EUR', '2026-12-20')).toBeNull()
  })
})

describe('messageDate: what is not the payment’s date', () => {
  it('keeps the arrival when there is no date', () => {
    expect(dateIn('Compra de 47,15 EUR en Example Shop')).toBeNull()
  })

  it('keeps the arrival when the text names two different dates', () => {
    expect(dateIn('Statement 01/11/2026 to 22/11/2026: 47,15 EUR')).toBeNull()
    expect(dateIn('Invoice of 2026-11-20 for 47,15 EUR charged on 2026-11-24')).toBeNull()
  })

  it('keeps the arrival when a date is out of the window, even beside one inside it', () => {
    expect(dateIn('Statement for 01/10/2026: 47,15 EUR')).toBeNull()
    expect(dateIn('Charged 47,15 EUR on 24/11/2026, plan started 01/01/2026')).toBeNull()
  })

  it.each([
    ['until', 'Split your 47,15 EUR purchase, valid until 30/11/2026'],
    ['before', 'Split your 47,15 EUR purchase before 30 Nov'],
    ['hasta', 'Fracciona tu compra de 47,15 EUR hasta el 30/11'],
    ['válido', 'Oferta de 47,15 EUR válido 30/11/2026'],
    ['expires', 'Card expires 30/11/2026, last charge 47,15 EUR'],
    ['vence', 'Tu recibo de 47,15 EUR vence el 30/11'],
    ['fecha límite', 'Fecha límite 30/11, importe 47,15 EUR'],
    ['vencimiento', 'Importe 47,15 EUR, fecha de vencimiento 30/11'],
    ['hasta el día', 'Paga 47,15 EUR hasta el día 30/11'],
  ])('keeps the arrival for a date after a limit word: %s', (_word, text) => {
    expect(dateIn(text)).toBeNull()
  })

  it.each([
    ['a time', 'Compra de 47,15 EUR a las 21:32'],
    ['an amount with a dot', 'Compra de 24.11 EUR'],
    ['an amount with a comma', 'Compra de 24,11 EUR'],
    ['a reference of eight digits', 'Recibo 20261124 de 47,15 EUR'],
    ['a phone number', 'Llama al +34 612 345 678 sobre 47,15 EUR'],
    ['a phone number with dots', 'Call 612.345.678 about 47,15 EUR'],
    ['a dashed reference', 'Ref 24-11-99999 for 47,15 EUR'],
    ['a day that does not exist', 'Cargo de 47,15 EUR el 31/11/2026'],
    ['a month name with no day', 'Recibo de noviembre: 47,15 EUR'],
    ['a month name followed by an amount', 'Recibo de noviembre 12 EUR'],
    // 20 November is inside the window from the 23rd, so only the amount rule keeps it from being read as a day.
    ['a month name followed by an amount inside the window', 'Recibo de noviembre 20 EUR'],
    ['the English modal may', 'You may be charged 47,15 EUR'],
    ['a dashed day and month with no year', 'Cargo 47,15 EUR ref 24-11'],
  ])('keeps the arrival for %s', (_name, text) => {
    expect(dateIn(text)).toBeNull()
  })
})

describe('messageDate: a range of days', () => {
  it.each([
    ['entre ... y', 'Se cargará 5,00 EUR entre el 24 y el 28 de noviembre'],
    ['del ... al', 'Se cargará 5,00 EUR del 24 al 28 de noviembre'],
    ['from ... to', 'We will charge 5,00 EUR from 24 to 28 November'],
    ['between ... and', 'We will charge 5,00 EUR between 24 and 28 Nov'],
    ['a dash on its own', 'Cargo de 5,00 EUR 24 - 28 de noviembre'],
  ])('keeps the arrival for a range: %s', (_name, text) => {
    expect(dateIn(text)).toBeNull()
  })

  it('still reads a day next to a word that can join a range when no day comes before it', () => {
    expect(dateIn('Cargo de 5,00 EUR a 24 de noviembre')).toBe('2026-11-24')
    expect(dateIn('Charge to 24 Nov: 5,00 EUR')).toBe('2026-11-24')
  })
})

describe('messageDate: a count written like a day', () => {
  it.each([
    ['an instalment', 'Cuota 2/12 de tu compra: 5,00 EUR', ARRIVAL],
    ['a plazo', 'Plazo 1/3 de 5,00 EUR', '2026-02-25'],
    ['a plazo with a number sign', 'Plazo nº 1/3 de 5,00 EUR', '2026-02-25'],
    ['an English instalment', 'Instalment 2/12 of 5,00 EUR', ARRIVAL],
    ['opening hours', 'Compra 5,00 EUR en Farmacia 24/7', '2026-07-20'],
  ])('keeps the arrival for %s', (_name, text, arrival) => {
    expect(dateIn(text, arrival)).toBeNull()
  })

  it('reads the same day and month as a date when no count word comes before it', () => {
    expect(dateIn('Cargo de 5,00 EUR el 2/12')).toBe('2026-12-02')
    // `24/7` is always opening hours; a bank writing 24 July with no year writes `24/07`.
    expect(dateIn('Cargo de 5,00 EUR el 24/7', '2026-07-20')).toBeNull()
    expect(dateIn('Cargo de 5,00 EUR el 24/07', '2026-07-20')).toBe('2026-07-24')
  })
})
