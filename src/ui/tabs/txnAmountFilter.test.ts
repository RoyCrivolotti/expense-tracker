import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT, resolveMoneyFormat } from '../../engine/money'
import { amountChipLabel, parseAmountBound, parseQueryAmount } from './txnAmountFilter'

const US = resolveMoneyFormat('USD', 'en-US')

describe('parseAmountBound', () => {
  it('reads an empty box as no bound', () => {
    expect(parseAmountBound('  ', EU_MONEY_FORMAT)).toBeNull()
  })

  it('reads amounts in the user number format', () => {
    expect(parseAmountBound('42,50', EU_MONEY_FORMAT)).toBe(4250)
    expect(parseAmountBound('1.200', EU_MONEY_FORMAT)).toBe(120_000)
    expect(parseAmountBound('1,200', US)).toBe(120_000)
  })

  it('ignores what is not an amount rather than guessing', () => {
    expect(parseAmountBound('250k', EU_MONEY_FORMAT)).toBeNull()
  })

  it('compares sizes, so a minus sign is dropped', () => {
    expect(parseAmountBound('-50', EU_MONEY_FORMAT)).toBe(5000)
  })
})

describe('parseQueryAmount', () => {
  it('matches every amount with that whole part when no cents are typed', () => {
    expect(parseQueryAmount('64', EU_MONEY_FORMAT)).toEqual({ fromCents: 6400, toCents: 6499 })
  })

  it('matches exactly when cents are typed', () => {
    expect(parseQueryAmount('64,10', EU_MONEY_FORMAT)).toEqual({ fromCents: 6410, toCents: 6410 })
    expect(parseQueryAmount('42.5', EU_MONEY_FORMAT)).toEqual({ fromCents: 4250, toCents: 4250 })
    expect(parseQueryAmount('64,00 €', EU_MONEY_FORMAT)).toEqual({ fromCents: 6400, toCents: 6400 })
  })

  it('reads three digits after a mark as thousands, as the parser does', () => {
    expect(parseQueryAmount('1.200', EU_MONEY_FORMAT)).toEqual({ fromCents: 120_000, toCents: 120_099 })
    expect(parseQueryAmount('$1,200', US)).toEqual({ fromCents: 120_000, toCents: 120_099 })
  })

  it('is null for ordinary search text', () => {
    expect(parseQueryAmount('coffee', EU_MONEY_FORMAT)).toBeNull()
  })
})

describe('amountChipLabel', () => {
  it('says nothing when no bound is set', () => {
    expect(amountChipLabel(null, null, EU_MONEY_FORMAT)).toBeNull()
  })

  it('names one bound as from or up to, since both are inclusive', () => {
    expect(amountChipLabel(10_000, null, EU_MONEY_FORMAT)).toBe('From 100 €')
    expect(amountChipLabel(null, 1050, EU_MONEY_FORMAT)).toBe('Up to 10,50 €')
  })

  it('names both bounds as a range', () => {
    expect(amountChipLabel(5000, 20_000, EU_MONEY_FORMAT)).toBe('50 € to 200 €')
  })
})
