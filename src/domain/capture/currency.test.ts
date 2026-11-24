import { describe, expect, it } from 'vitest'
import { currencyMarker, findMarker, isMarkerToken, splitNumberToken, standaloneMarker } from './currency'

describe('currencyMarker', () => {
  it.each([
    ['EUR', 'EUR'],
    ['eur', 'EUR'],
    ['Usd', 'USD'],
    ['€', 'EUR'],
    ['$', 'USD'],
    ['£', 'GBP'],
    ['¥', 'JPY'],
    ['R$', 'BRL'],
    ['r$', 'BRL'],
    ['CHF', 'CHF'],
    ['kr', 'SEK'],
    ['zł', 'PLN'],
    ['ZŁ', 'PLN'],
    ['Kč', 'CZK'],
    ['Kč'.normalize('NFD'), 'CZK'],
    ['EUR.', 'EUR'],
    ['(€)', 'EUR'],
  ])('reads the marker %j as %s', (token, code) => {
    expect(currencyMarker(token)).toBe(code)
  })

  it.each([
    ['50,00EUR', 'EUR'],
    ['50,00eur', 'EUR'],
    ['€12', 'EUR'],
    ['12€', 'EUR'],
    ['12€.', 'EUR'],
    ['$1,234.56', 'USD'],
    ['-€12', 'EUR'],
    ['€-12', 'EUR'],
    ['R$12,50', 'BRL'],
    ['12,50zł', 'PLN'],
    ['(£3.20)', 'GBP'],
  ])('finds the marker glued in %j', (token, code) => {
    expect(currencyMarker(token)).toBe(code)
  })

  it.each(['', 'compra', '12,34', '-12', 'XYZ', '12km', '12h', '€12km', '1,2,3x', '...'])(
    'finds none in %j',
    (token) => {
      expect(currencyMarker(token)).toBeNull()
    },
  )

  it('does not take a code that is also a word unless it is in capitals', () => {
    expect(currencyMarker('ALL')).toBe('ALL')
    expect(currencyMarker('all')).toBeNull()
    expect(currencyMarker('try')).toBeNull()
    expect(currencyMarker('5TRY')).toBe('TRY')
    expect(currencyMarker('5try')).toBeNull()
    expect(currencyMarker('ron')).toBeNull()
  })
})

describe('currencyMarker, names that belong to objects', () => {
  it.each(['constructor', 'Constructor.', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'])(
    'is no marker: %j',
    (token) => {
      expect(currencyMarker(token)).toBeNull()
      expect(isMarkerToken(token)).toBe(false)
      expect(findMarker(`12,00${token}`)).toBeNull()
    },
  )
})

describe('findMarker and standaloneMarker', () => {
  it('flags the symbols several currencies share as a guess', () => {
    for (const token of ['$', '¥', 'kr', '$12', '12kr']) expect(findMarker(token)).toMatchObject({ guess: true })
    expect(findMarker('$')).toEqual({ code: 'USD', guess: true })
  })
  it('does not flag a code or a symbol that is one currency', () => {
    for (const token of ['EUR', '€', 'R$', 'USD', '12,50€', 'zł'])
      expect(findMarker(token)).toMatchObject({ guess: false })
  })
  it('gives a standalone marker only for a token that is nothing else', () => {
    expect(standaloneMarker('EUR.')).toEqual({ code: 'EUR', guess: false })
    expect(standaloneMarker('12€')).toBeNull()
    expect(standaloneMarker('word')).toBeNull()
  })
})

describe('isMarkerToken', () => {
  it('is true for a marker alone and false once a number is attached', () => {
    expect(isMarkerToken('EUR')).toBe(true)
    expect(isMarkerToken('€')).toBe(true)
    expect(isMarkerToken('12€')).toBe(false)
    expect(isMarkerToken('compra')).toBe(false)
  })
})

describe('splitNumberToken', () => {
  it('splits sign, prefix, number and suffix', () => {
    expect(splitNumberToken('-50.0')).toEqual({ negative: true, positive: false, prefix: '', core: '50.0', suffix: '' })
    expect(splitNumberToken('−€1.234,56')).toEqual({
      negative: true,
      positive: false,
      prefix: '€',
      core: '1.234,56',
      suffix: '',
    })
    expect(splitNumberToken('12,34€.')).toEqual({
      negative: false,
      positive: false,
      prefix: '',
      core: '12,34',
      suffix: '€',
    })
    expect(splitNumberToken('+7')).toEqual({ negative: false, positive: true, prefix: '', core: '7', suffix: '' })
  })
  it('is null with no digits or with two runs of them', () => {
    expect(splitNumberToken('EUR')).toBeNull()
    expect(splitNumberToken('20/11/2026')).toBeNull()
  })
})
