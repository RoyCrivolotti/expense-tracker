import { describe, expect, it, vi } from 'vitest'
import type { ExpenseRepository } from '../ports/expenseRepository'
import { createFlag, patchFlag } from './flagService'

const repo = {
  createFlag: vi.fn().mockResolvedValue({}),
  updateFlag: vi.fn().mockResolvedValue({}),
} as unknown as ExpenseRepository

const valid = { name: 'Work travel', color: '#6366f1', reimbursable: true, sortOrder: 0, active: true }

describe('flagService — sortOrder and active', () => {
  it('rejects a non-numeric sort order instead of letting SQLite store it as text', async () => {
    // SQLite has type affinity, not enforcement: 'abc' lands in an INTEGER
    // column as TEXT and silently breaks every sort that reads it back.
    await expect(
      createFlag(repo, 'owner@example.com', { ...valid, sortOrder: 'abc' as unknown as number }),
    ).rejects.toThrow(/whole number/)
  })

  it('rejects a null sort order rather than leaking a NOT NULL constraint error', async () => {
    await expect(
      patchFlag(repo, 'owner@example.com', 1, { sortOrder: null as unknown as number }),
    ).rejects.toThrow(/whole number/)
  })

  it('rejects a non-boolean active', async () => {
    await expect(
      patchFlag(repo, 'owner@example.com', 1, { active: 'yes' as unknown as boolean }),
    ).rejects.toThrow(/true or false/)
  })

  it('accepts a well-formed flag', async () => {
    await expect(createFlag(repo, 'owner@example.com', valid)).resolves.toBeDefined()
  })
})

describe('flagService — autoLabelId', () => {
  it('rejects zero, a negative id, and a non-integer', async () => {
    await expect(
      patchFlag(repo, 'owner@example.com', 1, { autoLabelId: 0 }),
    ).rejects.toThrow(/positive whole number/)
    await expect(
      patchFlag(repo, 'owner@example.com', 1, { autoLabelId: -1 }),
    ).rejects.toThrow(/positive whole number/)
    await expect(
      patchFlag(repo, 'owner@example.com', 1, { autoLabelId: 1.5 }),
    ).rejects.toThrow(/positive whole number/)
  })

  it('passes a valid id through to the repository', async () => {
    const updateFlag = vi.fn().mockResolvedValue({})
    await patchFlag({ updateFlag } as unknown as ExpenseRepository, 'owner@example.com', 1, {
      autoLabelId: 5,
    })

    expect(updateFlag).toHaveBeenCalledWith('owner@example.com', 1, { autoLabelId: 5 })
  })

  it('passes an explicit null through, to clear it', async () => {
    const updateFlag = vi.fn().mockResolvedValue({})
    await patchFlag({ updateFlag } as unknown as ExpenseRepository, 'owner@example.com', 1, {
      autoLabelId: null,
    })

    expect(updateFlag).toHaveBeenCalledWith('owner@example.com', 1, { autoLabelId: null })
  })

  it('leaves it out of the repository call when absent from the patch', async () => {
    const updateFlag = vi.fn().mockResolvedValue({})
    await patchFlag({ updateFlag } as unknown as ExpenseRepository, 'owner@example.com', 1, {
      name: 'Renamed',
    })

    expect(updateFlag.mock.calls[0]?.[2]).not.toHaveProperty('autoLabelId')
  })
})
