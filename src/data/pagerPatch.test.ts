import { describe, expect, it } from 'vitest'
import { byApiOrder } from '../domain/ledger'
import type { Transaction } from '../domain/types'
import { makeTransaction } from '../testing/factories'
import { patchedRows, rowChangesOf } from './pagerPatch'

const row = (id: number, date: string, over: Partial<Transaction> = {}): Transaction => makeTransaction({ id, date, budgetMonth: date.slice(0, 7), ...over })
/** Newest first, as the API gives rows. */
const list = (...rows: Transaction[]): Transaction[] => [...rows].sort(byApiOrder)
const ids = (rows: readonly Transaction[]) => rows.map((r) => r.id)

describe('rowChangesOf', () => {
  it('names the rows that are new or changed, and the ids that are gone, by id', () => {
    const a = row(1, '2026-08-03')
    const b = row(2, '2026-08-02')
    const c = row(3, '2026-08-01')
    const editedB = { ...b, description: 'Edited' }
    const added = row(4, '2026-08-04')
    const changes = rowChangesOf([a, b, c], [a, editedB, added])
    expect(ids(changes.upserted)).toEqual([2, 4])
    expect(changes.removed).toEqual([3])
  })

  it('is empty for rows the patch left as the same objects', () => {
    const a = row(1, '2026-08-03')
    expect(rowChangesOf([a], [a])).toEqual({ upserted: [], removed: [] })
  })
})

describe('patchedRows', () => {
  const a = row(5, '2026-08-05', { categoryId: 1 })
  const b = row(4, '2026-08-04', { categoryId: 1 })
  const c = row(3, '2026-08-03', { categoryId: 2 })
  const d = row(2, '2026-08-02', { categoryId: 1 })
  const held = list(a, b, c, d)

  it('returns the very array it was given when nothing changed', () => {
    expect(patchedRows(held, {}, true, { upserted: [], removed: [] })).toBe(held)
    expect(patchedRows(held, {}, true, { upserted: [], removed: [99] })).toBe(held)
  })

  it('takes out a row that is gone and nothing else', () => {
    expect(ids(patchedRows(held, {}, false, { upserted: [], removed: [4, 2] }))).toEqual([5, 3])
  })

  it('replaces a row that is still in the filter, at its new place when its date moved', () => {
    const moved = { ...c, date: '2026-08-06', budgetMonth: '2026-08' }
    const next = patchedRows(held, {}, false, { upserted: [moved], removed: [] })
    expect(ids(next)).toEqual([3, 5, 4, 2])
    expect(next[0]).toBe(moved)
  })

  it('takes out a row the edit moved out of the filter', () => {
    const inFilter = list(a, b, d)
    const next = patchedRows(inFilter, { categoryId: 1 }, true, { upserted: [{ ...a, categoryId: 2 }], removed: [] })
    expect(ids(next)).toEqual([4, 2])
  })

  it('adds a new row that the filter matches, before the end of what was read, even when more is to come', () => {
    const fresh = row(9, '2026-08-04', { categoryId: 1 })
    expect(ids(patchedRows(list(a, b, d), { categoryId: 1 }, false, { upserted: [fresh], removed: [] }))).toEqual([5, 9, 4, 2])
  })

  it('does not add a new row the filter does not match', () => {
    const other = row(9, '2026-08-04', { categoryId: 2 })
    expect(patchedRows(held, { categoryId: 1 }, true, { upserted: [other], removed: [] })).toBe(held)
  })

  it('does not add a new row that comes after the end of what was read while more is to read, and adds it once the list is complete', () => {
    const old = row(1, '2026-07-01', { categoryId: 1 })
    expect(patchedRows(held, {}, false, { upserted: [old], removed: [] })).toBe(held)
    expect(ids(patchedRows(held, {}, true, { upserted: [old], removed: [] }))).toEqual([5, 4, 3, 2, 1])
  })

  it('adds nothing to a list with no row read yet that is not complete, since the first page has not come', () => {
    expect(patchedRows([], {}, false, { upserted: [row(9, '2026-08-04')], removed: [] })).toEqual([])
    expect(ids(patchedRows([], {}, true, { upserted: [row(9, '2026-08-04')], removed: [] }))).toEqual([9])
  })

  it('does not hold a row twice, whatever order the changes come in', () => {
    const edited = { ...b, description: 'Edited' }
    const next = patchedRows(held, {}, true, { upserted: [edited, edited], removed: [] })
    expect(ids(next)).toEqual([5, 4, 3, 2])
    expect(next[1]).toBe(edited)
  })
})
