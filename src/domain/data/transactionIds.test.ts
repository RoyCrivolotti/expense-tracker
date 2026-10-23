import { describe, expect, it } from 'vitest'
import { MAX_BULK_DELETE, parseDeleteTransactionIds } from './transactionIds'

describe('parseDeleteTransactionIds', () => {
  it('accepts positive integers and dedupes', () => {
    expect(parseDeleteTransactionIds([1, 2, 2, 3])).toEqual([1, 2, 3])
  })

  it('takes numbers as sent and refuses anything that would have to be coerced into an id', () => {
    for (const value of [true, '1', '1e1', ' 7 ', '', null, undefined, {}, [3], NaN, Infinity, 2 ** 53, -3]) {
      expect(() => parseDeleteTransactionIds([value]), `${typeof value}: ${JSON.stringify(value)}`).toThrow('Invalid transaction id')
    }
    expect(parseDeleteTransactionIds([Number.MAX_SAFE_INTEGER])).toEqual([Number.MAX_SAFE_INTEGER])
  })

  it('rejects empty, non-array, invalid, and oversized payloads', () => {
    expect(() => parseDeleteTransactionIds([])).toThrow(/empty/)
    expect(() => parseDeleteTransactionIds('1')).toThrow(/array/)
    expect(() => parseDeleteTransactionIds([0])).toThrow(/Invalid/)
    expect(() => parseDeleteTransactionIds([1.5])).toThrow(/Invalid/)
    expect(() => parseDeleteTransactionIds(Array(MAX_BULK_DELETE + 1).fill(1))).toThrow(/Too many/)
  })
})
