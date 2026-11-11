import { describe, expect, it } from 'vitest'
import { cleanText, findLastFour, foldTitle } from './text'

describe('cleanText', () => {
  it('strips control and bidi override characters and collapses whitespace', () => {
    expect(cleanText('  Shop‮evil\u0000 \n name⁦ ')).toBe('Shopevil name')
  })
  it('leaves ordinary accented text alone', () => {
    expect(cleanText('Café Ñandú')).toBe('Café Ñandú')
  })
})

describe('findLastFour', () => {
  it.each(['card *4321 used', 'card •••• 4321', 'card ending 4321', 'card ****4321 and *4321'])('finds it in %j', (body) => {
    expect(findLastFour(body)).toBe('4321')
  })
  it('returns null when two different cards are named, or none', () => {
    expect(findLastFour('from *1111 to *2222')).toBeNull()
    expect(findLastFour('no card here 4321')).toBeNull()
  })
  it('does not take part of a longer number', () => {
    expect(findLastFour('ref *123456')).toBeNull()
  })
})

describe('foldTitle', () => {
  it('ignores case, accents and spacing', () => {
    expect(foldTitle('  CONFIRMÁ  tu   compra ')).toBe('confirma tu compra')
  })
})
