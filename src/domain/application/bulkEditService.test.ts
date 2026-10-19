import { describe, expect, it } from 'vitest'
import { MAX_FILTER_EDIT_ROWS, bulkTooManyMessage } from '../data/bulkEdit'
import { inMemoryExpenseRepository } from '../../testing/inMemoryExpenseRepository'
import {
  bulkUpdateTransactionsByFilter,
  isFilterBody,
  parseBulkFilterEdit,
} from './bulkEditService'

const ok = { filter: { month: '2026-09' }, expectedCount: 12, expectedRevision: 'abc123', patch: { categoryId: 3 } }

const refused = (run: () => unknown): string => {
  try {
    run()
  } catch (error) {
    return (error as Error).message
  }
  return 'accepted'
}

describe('isFilterBody', () => {
  it('is true for a body that has a filter, whatever else it has', () => {
    expect(isFilterBody({ filter: {} })).toBe(true)
    expect(isFilterBody({ filter: null, ids: [1] })).toBe(true)
  })

  it('is false for the ids form and for anything that is not a body', () => {
    expect(isFilterBody({ ids: [1], patch: {} })).toBe(false)
    expect(isFilterBody(null)).toBe(false)
    expect(isFilterBody('filter')).toBe(false)
    expect(isFilterBody([{ filter: {} }])).toBe(false)
  })
})

describe('parseBulkFilterEdit', () => {
  it('reads the filter, the count, the revision and the patch', () => {
    expect(parseBulkFilterEdit(ok)).toEqual(ok)
  })

  it('spells the filter as the paged reads do, so a cursor’s filter and an edit’s are the same', () => {
    const edit = parseBulkFilterEdit({ ...ok, filter: { month: '2026-09', type: 'all', status: 'all', labelIds: [] } })

    expect(edit.filter).toEqual({ month: '2026-09' })
  })

  it('accepts an empty filter: every transaction, if the count says so', () => {
    expect(parseBulkFilterEdit({ ...ok, filter: {} }).filter).toEqual({})
  })

  it.each([
    ['no body', null, 'A request body is required'],
    ['a list', [], 'A request body is required'],
    ['ids beside the filter', { ...ok, ids: [1] }, 'Give ids or a filter, not both'],
    ['a field it does not know', { ...ok, owner: 'x@example.com' }, 'Unknown field "owner" in a filter request'],
    ['a filter that is not an object', { ...ok, filter: 'all' }, 'filter must be an object'],
    ['a null filter', { ...ok, filter: null }, 'filter must be an object'],
    ['a filter field it does not know', { ...ok, filter: { owner: 'x' } }, 'Unknown filter: owner'],
    ['a filter field it cannot read', { ...ok, filter: { month: 'June' } }, 'month must be YYYY-MM'],
    ['no count', { ...ok, expectedCount: undefined }, 'expectedCount must be the number of transactions you were shown'],
    ['a count that is text', { ...ok, expectedCount: '12' }, 'expectedCount must be the number of transactions you were shown'],
    ['a fractional count', { ...ok, expectedCount: 1.5 }, 'expectedCount must be the number of transactions you were shown'],
    ['a negative count', { ...ok, expectedCount: -1 }, 'expectedCount must be the number of transactions you were shown'],
    ['a count above the cap', { ...ok, expectedCount: MAX_FILTER_EDIT_ROWS + 1 }, bulkTooManyMessage()],
    ['no revision', { ...ok, expectedRevision: undefined }, 'expectedRevision must be the revision you were given'],
    ['a blank revision', { ...ok, expectedRevision: '' }, 'expectedRevision must be the revision you were given'],
    ['a revision that is a number', { ...ok, expectedRevision: 7 }, 'expectedRevision must be the revision you were given'],
    ['a revision that is far too long', { ...ok, expectedRevision: 'x'.repeat(101) }, 'expectedRevision must be the revision you were given'],
    ['no patch', { ...ok, patch: undefined }, 'patch is required'],
    ['an empty patch', { ...ok, patch: {} }, 'At least one field must be set'],
    ['a patch field that is not bulk-editable', { ...ok, patch: { amountCents: 5 } }, 'Field "amountCents" is not bulk-editable'],
  ])('refuses %s', (_name, body, message) => {
    expect(refused(() => parseBulkFilterEdit(body))).toBe(message)
  })

  it('accepts a count of zero and a count at the cap', () => {
    expect(parseBulkFilterEdit({ ...ok, expectedCount: 0 }).expectedCount).toBe(0)
    expect(parseBulkFilterEdit({ ...ok, expectedCount: MAX_FILTER_EDIT_ROWS }).expectedCount).toBe(MAX_FILTER_EDIT_ROWS)
  })
})

describe('handing the request to the repository', () => {
  const seed = {
    categories: [{ id: 1, name: 'Food', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
    accounts: [{ id: 1, name: 'Main', kind: 'debit' as const, settlement: 'immediate' as const, active: true }],
    transactions: ['2026-08', '2026-09', '2026-09'].map((month, i) => ({
      id: i + 1,
      date: `${month}-10`,
      budgetMonth: month,
      description: `Row ${i + 1}`,
      accountId: 1,
      categoryId: 1,
      type: 'expense' as const,
      amountCents: 500,
      cancelled: false,
      status: 'posted' as const,
      labelIds: [],
    })),
  }
  const owner = 'owner@example.com'

  it('edits the rows of the filter', async () => {
    const repo = inMemoryExpenseRepository(seed, owner)
    const edit = parseBulkFilterEdit({ ...ok, filter: { month: '2026-09' }, expectedCount: 2, patch: { description: 'Renamed' } })

    expect(await bulkUpdateTransactionsByFilter(repo, owner, edit)).toEqual({ updated: 2 })
    expect((await repo.loadDataset(owner)).transactions.map((t) => t.description)).toEqual(['Row 1', 'Renamed', 'Renamed'])
  })
})
