import { describe, expect, it } from 'vitest'
import { selectableOptions } from './pickerOptions'

interface Item {
  id: number
  active: boolean
}

const items: Item[] = [
  { id: 1, active: true },
  { id: 2, active: false },
  { id: 3, active: true },
]

describe('selectableOptions', () => {
  it('excludes inactive items when the current id is not one of them', () => {
    expect(selectableOptions(items, 1).map((i) => i.id)).toEqual([1, 3])
  })

  it('keeps an inactive item when it is the current id', () => {
    expect(selectableOptions(items, 2).map((i) => i.id)).toEqual([1, 2, 3])
  })

  it('returns only active items when currentId matches nothing (e.g. 0)', () => {
    expect(selectableOptions(items, 0).map((i) => i.id)).toEqual([1, 3])
  })

  it('returns an empty list when there are no items at all', () => {
    expect(selectableOptions([], 1)).toEqual([])
  })

  it('returns all items when every item is active', () => {
    const allActive: Item[] = [
      { id: 1, active: true },
      { id: 2, active: true },
    ]
    expect(selectableOptions(allActive, 5).map((i) => i.id)).toEqual([1, 2])
  })
})
