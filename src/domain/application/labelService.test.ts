import { describe, expect, it, vi } from 'vitest'
import type { ExpenseRepository } from '../ports/expenseRepository'
import type { Label } from '../types'
import type { NewLabel } from '../data/dataSource'
import { makeLabel } from '../../testing/factories'
import { createLabel, patchLabel, removeLabel, setTransactionLabels } from './labelService'

// Destructuring in the parameter position keeps the discarded binding inside
// ESLint's argsIgnorePattern — see the same trick in domain/engine/flagGroups.ts.
function withoutId({ id: _id, ...rest }: Label): NewLabel {
  return rest
}

// Named so assertions reference these directly rather than repo.method — a
// method-shorthand interface like ExpenseRepository trips
// @typescript-eslint/unbound-method when the property itself is the assertion target.
const createLabelMock = vi.fn().mockResolvedValue({})
const updateLabelMock = vi.fn().mockResolvedValue({})
const deleteLabelMock = vi.fn().mockResolvedValue({ unlabeled: 0 })
const setTransactionLabelsMock = vi.fn().mockResolvedValue({})

const repo = {
  createLabel: createLabelMock,
  updateLabel: updateLabelMock,
  deleteLabel: deleteLabelMock,
  setTransactionLabels: setTransactionLabelsMock,
} as unknown as ExpenseRepository

const valid = withoutId(makeLabel())

describe('labelService — sortOrder and active', () => {
  it('rejects a non-numeric sort order instead of letting SQLite store it as text', async () => {
    await expect(
      createLabel(repo, 'owner@example.com', { ...valid, sortOrder: 'abc' as unknown as number }),
    ).rejects.toThrow(/whole number/)
  })

  it('rejects a null sort order rather than leaking a NOT NULL constraint error', async () => {
    await expect(
      patchLabel(repo, 'owner@example.com', 1, { sortOrder: null as unknown as number }),
    ).rejects.toThrow(/whole number/)
  })

  it('rejects a non-boolean active', async () => {
    await expect(
      patchLabel(repo, 'owner@example.com', 1, { active: 'yes' as unknown as boolean }),
    ).rejects.toThrow(/true or false/)
  })

  it('accepts a well-formed label', async () => {
    await expect(createLabel(repo, 'owner@example.com', valid)).resolves.toBeDefined()
  })
})

describe('labelService — name and colour', () => {
  it('rejects a blank name', async () => {
    await expect(
      createLabel(repo, 'owner@example.com', { ...valid, name: '   ' }),
    ).rejects.toThrow(/name is required/)
  })

  it('rejects a colour that is not a hex value', async () => {
    await expect(
      createLabel(repo, 'owner@example.com', { ...valid, color: 'green' }),
    ).rejects.toThrow(/hex value/)
  })

  it('drops a blank description rather than storing an empty string', async () => {
    await createLabel(repo, 'owner@example.com', { ...valid, description: '   ' })
    const [, sent] = createLabelMock.mock.calls[0] as [string, { description?: string }]
    expect(sent).not.toHaveProperty('description')
  })

  it('rejects an over-long description', async () => {
    await expect(
      createLabel(repo, 'owner@example.com', { ...valid, description: 'x'.repeat(141) }),
    ).rejects.toThrow(/140 characters or fewer/)
  })

  it('trims and keeps a well-formed description', async () => {
    await createLabel(repo, 'owner@example.com', { ...valid, description: '  Spring trip  ' })
    const [, sent] = createLabelMock.mock.calls.at(-1) as [string, { description?: string }]
    expect(sent.description).toBe('Spring trip')
  })

  it('patches a description to a new value', async () => {
    await patchLabel(repo, 'owner@example.com', 1, { description: 'Autumn trip' })
    expect(updateLabelMock).toHaveBeenCalledWith(
      'owner@example.com',
      1,
      expect.objectContaining({ description: 'Autumn trip' }),
    )
  })

  it('clears a description via an explicit empty string', async () => {
    await patchLabel(repo, 'owner@example.com', 1, { description: '' })
    expect(updateLabelMock).toHaveBeenCalledWith(
      'owner@example.com',
      1,
      expect.objectContaining({ description: '' }),
    )
  })
})

describe('removeLabel', () => {
  it('delegates straight to the repository', async () => {
    await removeLabel(repo, 'owner@example.com', 5)
    expect(deleteLabelMock).toHaveBeenCalledWith('owner@example.com', 5)
  })
})

describe('setTransactionLabels — labelIds validation', () => {
  it('rejects a non-array payload', async () => {
    await expect(
      setTransactionLabels(repo, 'owner@example.com', 1, 'not-an-array'),
    ).rejects.toThrow(/must be an array/)
  })

  it('rejects a non-positive-integer id', async () => {
    await expect(setTransactionLabels(repo, 'owner@example.com', 1, [1, -2])).rejects.toThrow(
      /Invalid labelId/,
    )
    await expect(setTransactionLabels(repo, 'owner@example.com', 1, [1.5])).rejects.toThrow(
      /Invalid labelId/,
    )
  })

  it('dedupes before reaching the repository, so a repeated id cannot trip the UNIQUE constraint', async () => {
    await setTransactionLabels(repo, 'owner@example.com', 1, [3, 3, 5])
    expect(setTransactionLabelsMock).toHaveBeenCalledWith('owner@example.com', 1, [3, 5])
  })

  it('accepts an empty array, clearing every label', async () => {
    await setTransactionLabels(repo, 'owner@example.com', 1, [])
    expect(setTransactionLabelsMock).toHaveBeenCalledWith('owner@example.com', 1, [])
  })
})
