import { describe, expect, it } from 'vitest'
import { CURRENCIES } from '../../ui/settings/moneyOptions'
import { EU_MONEY_FORMAT, currencyWord, resolveMoneyFormat } from './money'

describe('currencyWord', () => {
  it('names the money of the currency the owner picked, in the plural, as a sentence needs it', () => {
    const words: Record<string, string> = {
      EUR: 'euros',
      USD: 'US dollars',
      GBP: 'British pounds',
      CHF: 'Swiss francs',
      JPY: 'Japanese yen',
      CAD: 'Canadian dollars',
      AUD: 'Australian dollars',
      SEK: 'Swedish kronor',
      NOK: 'Norwegian kroner',
      DKK: 'Danish kroner',
      PLN: 'Polish zlotys',
      BRL: 'Brazilian reals',
      MXN: 'Mexican pesos',
      INR: 'Indian rupees',
    }
    for (const { code } of CURRENCIES) expect(currencyWord(resolveMoneyFormat(code, 'en-US'))).toBe(words[code])
  })

  it('knows the code the format was made from, and the default is euros', () => {
    expect(resolveMoneyFormat('USD', 'en-US').currencyCode).toBe('USD')
    expect(EU_MONEY_FORMAT.currencyCode).toBe('EUR')
    expect(currencyWord(EU_MONEY_FORMAT)).toBe('euros')
    expect(currencyWord(resolveMoneyFormat())).toBe('euros')
  })

  it('does not depend on the number style: the word is the currency\'s, not the locale\'s', () => {
    expect(currencyWord(resolveMoneyFormat('USD', 'de-DE'))).toBe('US dollars')
    expect(currencyWord(resolveMoneyFormat('EUR', 'en-US'))).toBe('euros')
  })

  it('says the code itself for one the runtime has no name for, and money for a format made by hand with no code and no euro', () => {
    expect(currencyWord(resolveMoneyFormat('XYZ', 'en-US'))).toBe('XYZ')
    expect(currencyWord({ locale: 'en-US', symbol: '$', symbolPosition: 'prefix', decimalSeparator: '.' })).toBe('money')
    expect(currencyWord({ locale: 'de-DE', symbol: '€', symbolPosition: 'suffix', decimalSeparator: ',' })).toBe('euros')
  })
})
