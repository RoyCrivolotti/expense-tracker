import { describe, expect, it } from 'vitest'
import { suggestType } from './suggest'
import type { PushKind, SuggestedType } from './types'

describe('suggestType', () => {
  it.each<[PushKind, SuggestedType]>([
    ['card-purchase', 'expense'],
    ['cash-withdrawal', 'expense'],
    ['transfer-sent', 'expense'],
    ['bizum-received', 'income'],
    ['inflow', 'income'],
    ['refund', 'refund'],
  ])('suggests %s as %s', (kind, type) => {
    expect(suggestType(kind)).toBe(type)
  })
})
