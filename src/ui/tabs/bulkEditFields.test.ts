import { describe, expect, it } from 'vitest'
import { anyFieldEnabled, buildBulkPatch, type BulkEditFieldState } from './bulkEditFields'

function fields(overrides: Partial<BulkEditFieldState> = {}): BulkEditFieldState {
  return {
    categoryEnabled: false,
    categoryId: 1,
    accountEnabled: false,
    accountId: 2,
    typeEnabled: false,
    type: 'expense',
    dateEnabled: false,
    date: '2026-05-01',
    budgetMonthEnabled: false,
    budgetMonth: '2026-05',
    flagEnabled: false,
    flagId: 7,
    ...overrides,
  }
}

describe('anyFieldEnabled', () => {
  it('is false when nothing is toggled on', () => {
    expect(anyFieldEnabled(fields())).toBe(false)
  })

  it('counts the flag field, so Apply enables for a flag-only edit', () => {
    expect(anyFieldEnabled(fields({ flagEnabled: true }))).toBe(true)
  })
})

describe('buildBulkPatch', () => {
  it('sends nothing for an untouched form', () => {
    expect(buildBulkPatch(fields())).toEqual({})
  })

  it('omits the value of a field that is toggled off', () => {
    // The value survives while disabled so toggling back restores it — it must
    // not leak into the patch.
    expect(buildBulkPatch(fields({ categoryEnabled: true }))).toEqual({ categoryId: 1 })
  })

  it('sends a flag id when the flag field is on', () => {
    expect(buildBulkPatch(fields({ flagEnabled: true }))).toEqual({ flagId: 7 })
  })

  it('sends null to clear the flag, rather than omitting it', () => {
    expect(buildBulkPatch(fields({ flagEnabled: true, flagId: null }))).toEqual({ flagId: null })
  })

  it('combines every enabled field', () => {
    expect(
      buildBulkPatch(
        fields({
          categoryEnabled: true,
          accountEnabled: true,
          typeEnabled: true,
          dateEnabled: true,
          budgetMonthEnabled: true,
          flagEnabled: true,
        }),
      ),
    ).toEqual({
      categoryId: 1,
      accountId: 2,
      type: 'expense',
      date: '2026-05-01',
      budgetMonth: '2026-05',
      flagId: 7,
    })
  })
})
