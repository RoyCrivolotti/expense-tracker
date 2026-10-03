import { describe, expect, it } from 'vitest'
import { shortName, tableName } from './scenarioNames'

describe('shortName', () => {
  it('stops at the colon, and leaves a name without one alone', () => {
    expect(shortName('Path A: Invest only')).toBe('Path A')
    expect(shortName('Plan B')).toBe('Plan B')
  })
})

describe('tableName', () => {
  it('is the short name when no other scenario would be given it', () => {
    expect(tableName('Path A: Invest only', ['Path A: Invest only', 'Path B: House now'])).toBe('Path A')
  })

  it('is the full name when another scenario would be given the same short name', () => {
    const names = ['Path A: Invest only', 'Path A: Invest only (copy)']

    expect(tableName(names[0]!, names)).toBe('Path A: Invest only')
    expect(tableName(names[1]!, names)).toBe('Path A: Invest only (copy)')
  })

  it('does not count a scenario against itself, nor one with the very same name', () => {
    expect(tableName('Path A: Invest only', ['Path A: Invest only', 'Path A: Invest only'])).toBe('Path A')
  })
})
