import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT } from '../../../../engine/money'
import { fiTargetsLine } from './fiTargetsLine'

const money = (cents: number) => `${(cents / 100).toLocaleString('de-DE', { maximumFractionDigits: 0 })} €`

describe('fiTargetsLine', () => {
  it('says what the same spending needs at each of the three rates, in the owner\'s number format', () => {
    expect(fiTargetsLine(3_000_000, money, EU_MONEY_FORMAT)).toBe(
      'The same spending needs 750.000 € at 4,0%, 857.143 € at 3,5% or 1.000.000 € at 3,0%.',
    )
  })

  it('says nothing with no spending to cover', () => {
    expect(fiTargetsLine(0, money, EU_MONEY_FORMAT)).toBeNull()
  })
})
