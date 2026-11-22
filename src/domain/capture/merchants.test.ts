import { describe, expect, it } from 'vitest'
import { ANY_AMOUNT, MAX_MERCHANT_DESCRIPTION, merchantKeyOf, merchantVotes } from './merchants'

const saved = { amountCents: 1250, type: 'expense', accountId: 3, description: '  Coffee  ', categoryId: 7 }

describe('merchantKeyOf', () => {
  it('folds a merchant the way the phone folds its own history', () => {
    expect(merchantKeyOf('CAFÉ  Example 0042')).toBe('cafe example')
  })

  it('learns nothing from a whole push, which shows the amount with its marker', () => {
    expect(merchantKeyOf('Has pagado 12,50 EUR en Example Cafe')).toBeNull()
    expect(merchantKeyOf('Paid €12.50 at Example Cafe')).toBeNull()
  })

  it('learns a body whose amount sat in the title, which shows no marker', () => {
    expect(merchantKeyOf('Example Cafe Madrid')).toBe('example cafe madrid')
  })

  it('learns nothing with no text, nothing left after the fold, or a key longer than 80 characters', () => {
    expect(merchantKeyOf(null)).toBeNull()
    expect(merchantKeyOf('0042 1234')).toBeNull()
    expect(merchantKeyOf('word '.repeat(16))).toHaveLength(79)
    expect(merchantKeyOf('word '.repeat(17))).toBeNull()
  })
})

describe('merchantVotes', () => {
  it('votes once at any price and once at the saved price, with the description trimmed', () => {
    const common = { key: 'example cafe', description: 'Coffee', categoryId: 7, type: 'expense', accountId: 3 }
    expect(merchantVotes('Example Cafe', saved)).toEqual([
      { ...common, amountCents: ANY_AMOUNT },
      { ...common, amountCents: 1250 },
    ])
  })

  it('votes at the price without its sign', () => {
    expect(merchantVotes('Example Cafe', { ...saved, amountCents: -1250 }).map((v) => v.amountCents)).toEqual([
      ANY_AMOUNT,
      1250,
    ])
  })

  it('votes only at any price for a row of no amount', () => {
    expect(merchantVotes('Example Cafe', { ...saved, amountCents: 0 }).map((v) => v.amountCents)).toEqual([ANY_AMOUNT])
  })

  it('casts no vote for text that is not a merchant, or a description that is blank or too long to keep', () => {
    expect(merchantVotes('Has pagado 12,50 EUR en Example Cafe', saved)).toEqual([])
    expect(merchantVotes('Example Cafe', { ...saved, description: '   ' })).toEqual([])
    expect(merchantVotes('Example Cafe', { ...saved, description: 'x'.repeat(MAX_MERCHANT_DESCRIPTION + 1) })).toEqual(
      [],
    )
    expect(merchantVotes('Example Cafe', { ...saved, description: 'x'.repeat(MAX_MERCHANT_DESCRIPTION) })).toHaveLength(
      2,
    )
  })
})
