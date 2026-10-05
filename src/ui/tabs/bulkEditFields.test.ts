import { describe, expect, it } from 'vitest'
import {
  anyFieldEnabled,
  buildBulkLabelAdditions,
  buildBulkPatch,
  canApplyBulkEdit,
  summarizeDescriptions,
  type BulkEditFieldState,
} from './bulkEditFields'

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
    labelsEnabled: false,
    labelIds: [3, 4],
    descriptionEnabled: false,
    description: '  Netflix  ',
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

  it('counts the labels field, so Apply enables for a labels-only edit', () => {
    expect(anyFieldEnabled(fields({ labelsEnabled: true }))).toBe(true)
  })

  it('counts the description field, so a rename-only edit has something to apply', () => {
    expect(anyFieldEnabled(fields({ descriptionEnabled: true }))).toBe(true)
  })
})

describe('canApplyBulkEdit', () => {
  it('is false for an untouched form', () => {
    expect(canApplyBulkEdit(fields())).toBe(false)
  })

  it('is true for a rename with text', () => {
    expect(canApplyBulkEdit(fields({ descriptionEnabled: true }))).toBe(true)
  })

  it('is false while the description is on but empty, even with another field on', () => {
    expect(canApplyBulkEdit(fields({ descriptionEnabled: true, description: '' }))).toBe(false)
    expect(
      canApplyBulkEdit(fields({ descriptionEnabled: true, description: '', categoryEnabled: true })),
    ).toBe(false)
  })

  it('treats spaces alone as blank', () => {
    expect(canApplyBulkEdit(fields({ descriptionEnabled: true, description: '   ' }))).toBe(false)
  })

  it('ignores a blank description that is switched off', () => {
    expect(canApplyBulkEdit(fields({ description: '', categoryEnabled: true }))).toBe(true)
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

  it('sends the description trimmed when the field is on', () => {
    expect(buildBulkPatch(fields({ descriptionEnabled: true }))).toEqual({ description: 'Netflix' })
  })

  it('keeps the typed description out of the patch while the field is off', () => {
    expect(buildBulkPatch(fields())).toEqual({})
  })

  it('never includes labels: there is no column to patch for them', () => {
    expect(buildBulkPatch(fields({ labelsEnabled: true }))).toEqual({})
  })
})

describe('buildBulkLabelAdditions', () => {
  it('is empty for an untouched form', () => {
    expect(buildBulkLabelAdditions(fields())).toEqual([])
  })

  it('is empty when the labels field is toggled off, even with labels chosen', () => {
    expect(buildBulkLabelAdditions(fields({ labelIds: [3, 4] }))).toEqual([])
  })

  it('returns the chosen labels once the field is on', () => {
    expect(buildBulkLabelAdditions(fields({ labelsEnabled: true, labelIds: [3, 4] }))).toEqual([3, 4])
  })
})

describe('summarizeDescriptions', () => {
  const rows = [
    { id: 1, description: 'Netflix' },
    { id: 2, description: 'Netflix ' },
    { id: 3, description: 'NETFLIX.COM' },
    { id: 4, description: 'Spotify' },
    { id: 5, description: 'Rent' },
  ]

  it('counts only the chosen rows, most common first', () => {
    expect(summarizeDescriptions(rows, new Set([1, 2, 3, 4]))).toEqual([
      { description: 'Netflix', count: 2 },
      { description: 'NETFLIX.COM', count: 1 },
      { description: 'Spotify', count: 1 },
    ])
  })

  it('is empty when nothing chosen is in the list', () => {
    expect(summarizeDescriptions(rows, new Set([99]))).toEqual([])
  })
})
