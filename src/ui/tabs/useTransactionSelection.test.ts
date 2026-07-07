import { describe, expect, it } from 'vitest'
import { batchDeleteMessage } from './useTransactionSelection'

describe('batchDeleteMessage', () => {
  it('uses singular copy for one row', () => {
    expect(batchDeleteMessage(1)).toBe('1 transaction will be removed permanently.')
  })

  it('uses plural copy for multiple rows', () => {
    expect(batchDeleteMessage(3)).toBe('3 transactions will be removed permanently.')
  })
})
