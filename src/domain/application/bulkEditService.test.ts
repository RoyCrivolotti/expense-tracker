import { describe, expect, it } from 'vitest'
import { MAX_BULK_LABELS, MAX_BULK_LABEL_LINKS, MAX_FILTER_EDIT_ROWS, bulkTooManyMessage } from '../data/bulkEdit'
import { MAX_BULK_DELETE } from '../data/transactionIds'
import { inMemoryExpenseRepository } from '../../testing/inMemoryExpenseRepository'
import {
  addLabelsToTransactions,
  bulkUpdateTransactionsByFilter,
  isFilterBody,
  parseBulkFilterEdit,
  parseBulkLabelRequest,
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

describe('parseBulkLabelRequest', () => {
  it('reads rows by id, with the labels once each', () => {
    expect(parseBulkLabelRequest({ ids: [3, 3, 4], labelIds: [1, 2, 1] })).toEqual({
      target: { ids: [3, 4] },
      labelIds: [1, 2],
    })
  })

  it('reads rows by filter, with the count and the revision', () => {
    expect(
      parseBulkLabelRequest({ filter: { month: '2026-09' }, expectedCount: 4, expectedRevision: 'r', labelIds: [2] }),
    ).toEqual({ target: { filter: { month: '2026-09' }, expectedCount: 4 }, expectedRevision: 'r', labelIds: [2] })
  })

  it.each([
    ['no body', undefined, 'A request body is required'],
    ['no labels', { ids: [1] }, 'labelIds must name at least one label'],
    ['an empty list of labels', { ids: [1], labelIds: [] }, 'labelIds must name at least one label'],
    ['a label that is not an id', { ids: [1], labelIds: ['a'] }, 'Invalid labelId'],
    ['a label id of zero', { ids: [1], labelIds: [0] }, 'Invalid labelId'],
    ['too many labels', { ids: [1], labelIds: Array.from({ length: MAX_BULK_LABELS + 1 }, (_, i) => i + 1) }, `A request may name at most ${MAX_BULK_LABELS} labels`],
    ['no rows', { labelIds: [1] }, 'ids must be an array'],
    ['an empty list of ids', { ids: [], labelIds: [1] }, 'ids must not be empty'],
    ['ids and a filter', { ids: [1], filter: {}, expectedCount: 1, expectedRevision: 'r', labelIds: [1] }, 'Give ids or a filter, not both'],
    ['a field it does not know', { ids: [1], labelIds: [1], patch: {} }, 'Unknown field "patch" in a filter request'],
    ['a filter with no revision', { filter: {}, expectedCount: 1, labelIds: [1] }, 'expectedRevision must be the revision you were given'],
    ['a filter with no count', { filter: {}, expectedRevision: 'r', labelIds: [1] }, 'expectedCount must be the number of transactions you were shown'],
  ])('refuses %s', (_name, body, message) => {
    expect(refused(() => parseBulkLabelRequest(body))).toBe(message)
  })

  it('refuses ids times labels above the cap before any row is read', () => {
    const ids = Array.from({ length: MAX_BULK_DELETE }, (_, i) => i + 1)
    const labelIds = Array.from({ length: MAX_BULK_LABEL_LINKS / MAX_BULK_DELETE + 1 }, (_, i) => i + 1)

    expect(refused(() => parseBulkLabelRequest({ ids, labelIds }))).toMatch(/at most 5,000 labels in all/)
    expect(() => parseBulkLabelRequest({ ids, labelIds: labelIds.slice(1) })).not.toThrow()
  })
})

describe('handing the request to the repository', () => {
  const seed = {
    categories: [{ id: 1, name: 'Food', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
    accounts: [{ id: 1, name: 'Main', kind: 'debit' as const, settlement: 'immediate' as const, active: true }],
    labels: [{ id: 1, name: 'Trip', color: '#10b981', sortOrder: 0, active: true }],
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

  it('adds the labels', async () => {
    const repo = inMemoryExpenseRepository(seed, owner)
    const request = parseBulkLabelRequest({ ids: [1, 2], labelIds: [1] })

    expect(await addLabelsToTransactions(repo, owner, request)).toEqual({ matched: 2, added: 2 })
  })
})
