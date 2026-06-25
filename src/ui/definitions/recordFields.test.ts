import { describe, expect, it } from 'vitest'
import { fromInput, toInput } from './recordFields'

describe('recordFields money', () => {
  it.each([110, 1010, 145660])('round-trips %i cents', (cents) => {
    const input = toInput('money', cents)
    expect(fromInput('money', input)).toBe(cents)
  })
})
