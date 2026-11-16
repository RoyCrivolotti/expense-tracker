import { describe, expect, it } from 'vitest'
import { tokenise } from './shape'

describe('tokenise', () => {
  it('splits on whitespace and keeps punctuation on its token', () => {
    expect(tokenise('Compra de 12,34 EUR, en  EXAMPLE.')).toEqual(['Compra', 'de', '12,34', 'EUR,', 'en', 'EXAMPLE.'])
  })
  it('cleans hidden characters first, and gives nothing for an empty text', () => {
    expect(tokenise('a‮b \n c')).toEqual(['ab', 'c'])
    expect(tokenise('  ')).toEqual([])
  })
})
