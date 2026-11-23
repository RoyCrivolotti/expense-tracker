import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataSource } from '../data/dataSource'
import { bulkWriteOf } from './bulkWrite'
import { createWrites } from './createWrites'
import { planningWrites, wealthWrites } from './planningWrites'
import { referenceWrites, tagWrites } from './referenceWrites'
import { statementWrites, transactionWrites } from './transactionWrites'
import { useExpenseActions } from './useExpenseActions'

const source: ExpenseDataSource = { canWrite: true, load: vi.fn() }
const applyPatch = vi.fn()

/** The keys of each object `useExpenseActions` spreads into the actions, in the order it spreads them. */
const parts = [
  createWrites(source, applyPatch, undefined),
  transactionWrites(source, applyPatch, bulkWriteOf(applyPatch)),
  statementWrites(source, applyPatch),
  tagWrites(source, applyPatch),
  referenceWrites(source, applyPatch),
  planningWrites(source, applyPatch),
  wealthWrites(source, applyPatch),
].map((part) => Object.keys(part))

describe('the write factories behind useExpenseActions', () => {
  // A key two factories both return is taken from the later spread without a word from the type checker.
  it('never return the same action twice', () => {
    const all = parts.flat()
    expect(all.length).toBeGreaterThan(0)
    expect(new Set(all).size).toBe(all.length)
  })

  it('return every action the hook has, apart from the few it builds itself', () => {
    const { result } = renderHook(() => useExpenseActions(source, applyPatch, vi.fn()))
    const own = ['onAdd', 'onDuplicate', 'onEdit', 'updateSettings']
    expect([...own, ...parts.flat()].sort()).toEqual(Object.keys(result.current!).sort())
  })
})
