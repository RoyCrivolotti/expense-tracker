import { describe, expect, it } from 'vitest'
import { cleanText, foldTitle, trimEdges } from './text'

describe('cleanText', () => {
  it('strips control and bidi override characters and collapses whitespace', () => {
    expect(cleanText('  Shop‮evil\u0000 \n name⁦ ')).toBe('Shopevil name')
  })
  it('leaves ordinary accented text alone', () => {
    expect(cleanText('Café Ñandú')).toBe('Café Ñandú')
  })
})

describe('foldTitle', () => {
  it('ignores case, accents and spacing', () => {
    expect(foldTitle('  CONFIRMÁ  tu   compra ')).toBe('confirma tu compra')
  })
})

describe('trimEdges', () => {
  it('drops brackets, quotes and sentence punctuation from both ends', () => {
    expect(trimEdges('(12,34)')).toBe('12,34')
    expect(trimEdges('"EXAMPLE".')).toBe('EXAMPLE')
    expect(trimEdges('¿cuánto?')).toBe('cuánto')
  })
  it('keeps a leading dot or comma, which belong to a number', () => {
    expect(trimEdges('.5')).toBe('.5')
    expect(trimEdges('**0000.')).toBe('**0000')
  })
})
