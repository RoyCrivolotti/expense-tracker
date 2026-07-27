import { describe, expect, it } from 'vitest'
import { optionLabel, selectableOptions } from './pickerOptions'

interface Item {
  id: number
  name: string
  active: boolean
}

const items: Item[] = [
  { id: 1, name: 'One', active: true },
  { id: 2, name: 'Two', active: false },
  { id: 3, name: 'Three', active: true },
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

  it('adds only a placeholder when there are no items at all and currentId is a real (non-zero) id', () => {
    expect(selectableOptions<Item>([], 1).map((i) => i.id)).toEqual([1])
  })

  it('returns an empty list when there are no items and currentId is the "unselected" sentinel 0', () => {
    expect(selectableOptions<Item>([], 0)).toEqual([])
  })

  it('adds a placeholder when currentId matches none of the (all-active) items', () => {
    const allActive: Item[] = [
      { id: 1, name: 'One', active: true },
      { id: 2, name: 'Two', active: true },
    ]
    expect(selectableOptions(allActive, 5).map((i) => i.id)).toEqual([5, 1, 2])
  })

  it('adds a placeholder for a currentId that matches no item at all (fully deleted, not just archived)', () => {
    const result = selectableOptions(items, 99)
    expect(result.map((i) => i.id)).toEqual([99, 1, 3])
    // `active: true` on the placeholder is deliberate — see optionLabel: its name
    // already says "Deleted (unavailable)", so it shouldn't also get "(archived)".
    expect(result[0]).toMatchObject({ id: 99, name: 'Deleted (unavailable)', active: true })
  })

  it('does not add a placeholder for currentId 0 even though it matches nothing', () => {
    // 0 is the "nothing selected yet" sentinel for a brand-new record, not a real id.
    expect(selectableOptions(items, 0).map((i) => i.id)).toEqual([1, 3])
  })
})

describe('optionLabel', () => {
  it('returns the name as-is for an active item', () => {
    expect(optionLabel({ name: 'Groceries', active: true })).toBe('Groceries')
  })

  it('suffixes "(archived)" for an inactive item', () => {
    expect(optionLabel({ name: 'Old category', active: false })).toBe('Old category (archived)')
  })
})
