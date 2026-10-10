import { describe, expect, it } from 'vitest'
import { formatMoneyInput, parseMoneyToCents, resolveMoneyFormat } from './money'

// A currency with no minor unit (the yen) writes no decimal part, so its decimal mark cannot be read off a formatted
// sample of it: it was left as a point, which a comma number style uses for thousands.
const CURRENCIES = ['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'SEK', 'DKK', 'NOK', 'PLN', 'CZK', 'KRW', 'CAD', 'AUD', 'MXN']
const LOCALES = ['de-DE', 'en-US', 'fr-FR', 'en-GB', 'es-ES', 'ja-JP']

describe('the decimal mark of a money format', () => {
  it.each([
    ['JPY', 'de-DE', ','],
    ['KRW', 'de-DE', ','],
    ['JPY', 'en-US', '.'],
    ['JPY', 'fr-FR', ','],
    ['EUR', 'de-DE', ','],
    ['USD', 'en-US', '.'],
  ])('is read from the number style, not the currency: %s in %s uses %j', (currency, locale, mark) => {
    expect(resolveMoneyFormat(currency, locale).decimalSeparator).toBe(mark)
  })

  it('reads back, for every currency in every number style, what the box wrote', () => {
    for (const code of CURRENCIES) {
      for (const locale of LOCALES) {
        const format = resolveMoneyFormat(code, locale)
        for (const cents of [0, 5, 150, 123_456_00, 987_654_321_00]) {
          expect(parseMoneyToCents(formatMoneyInput(cents, format), format), `${code} ${locale} ${cents}`).toBe(cents)
        }
      }
    }
  })

  it('does not turn 123.456,00 yen under the German style into nothing', () => {
    const format = resolveMoneyFormat('JPY', 'de-DE')
    expect(formatMoneyInput(12_345_600, format)).toBe('123.456,00')
    expect(parseMoneyToCents('123.456,00', format)).toBe(12_345_600)
  })
})
