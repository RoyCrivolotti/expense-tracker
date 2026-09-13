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
