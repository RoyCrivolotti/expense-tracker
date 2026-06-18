import { describe, expect, it } from 'vitest'
import { dateSelectionState, toggleDateSelection } from './selectionUtils'

describe('toggleDateSelection', () => {
  it('selects all ids when any are unselected', () => {
    expect(toggleDateSelection(new Set([1]), [1, 2, 3])).toEqual(new Set([1, 2, 3]))
  })

  it('clears the day when every id is already selected', () => {
    expect(toggleDateSelection(new Set([1, 2, 3]), [1, 2, 3])).toEqual(new Set())
  })
})

describe('dateSelectionState', () => {
  it('reports none, partial, and all', () => {
    expect(dateSelectionState(new Set(), [1, 2])).toBe('none')
    expect(dateSelectionState(new Set([1]), [1, 2])).toBe('partial')
    expect(dateSelectionState(new Set([1, 2]), [1, 2])).toBe('all')
  })
})
