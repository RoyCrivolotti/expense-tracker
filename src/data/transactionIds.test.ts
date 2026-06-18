import { describe, expect, it } from 'vitest'
import { MAX_BULK_DELETE, parseDeleteTransactionIds } from './transactionIds'

describe('parseDeleteTransactionIds', () => {
  it('accepts positive integers and dedupes', () => {
    expect(parseDeleteTransactionIds([1, 2, 2, 3])).toEqual([1, 2, 3])
  })

  it('rejects empty, non-array, invalid, and oversized payloads', () => {
    expect(() => parseDeleteTransactionIds([])).toThrow(/empty/)
    expect(() => parseDeleteTransactionIds('1')).toThrow(/array/)
    expect(() => parseDeleteTransactionIds([0])).toThrow(/Invalid/)
    expect(() => parseDeleteTransactionIds([1.5])).toThrow(/Invalid/)
    expect(() => parseDeleteTransactionIds(Array(MAX_BULK_DELETE + 1).fill(1))).toThrow(/Too many/)
  })
})
