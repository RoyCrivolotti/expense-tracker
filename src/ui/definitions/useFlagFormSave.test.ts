import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Flag } from '../../types'
import type { ExpenseActions } from '../actions'
import { initialFlagDraft, useFlagFormSave } from './useFlagFormSave'

const flag: Flag = {
  id: 7,
  name: 'Work travel',
  color: '#6366f1',
  description: 'Reimbursable',
  sortOrder: 2,
  active: true,
}

function actionsWith(overrides: Partial<ExpenseActions>): ExpenseActions {
  return {
    createFlag: vi.fn().mockResolvedValue(flag),
    updateFlag: vi.fn().mockResolvedValue(undefined),
    deleteFlag: vi.fn().mockResolvedValue({ unflagged: 0 }),
    ...overrides,
  } as unknown as ExpenseActions
}

const draft = { name: 'Work travel', description: '', color: '#6366f1', active: true }

describe('initialFlagDraft', () => {
  it('opens empty for a new flag, with the default colour', () => {
    expect(initialFlagDraft(null, '#abcdef')).toEqual({
      name: '',
      description: '',
      color: '#abcdef',
      active: true,
    })
  })

  it('opens from an existing flag', () => {
    expect(initialFlagDraft(flag, '#abcdef')).toEqual({
      name: 'Work travel',
      description: 'Reimbursable',
      color: '#6366f1',
      active: true,
    })
  })

  it('treats a missing description as empty rather than undefined', () => {
    const bare = { ...flag }
    delete bare.description

    expect(initialFlagDraft(bare, '#abcdef').description).toBe('')
  })
})

describe('useFlagFormSave', () => {
  it('creates a flag at the end of the existing order', async () => {
    const createFlag = vi.fn().mockResolvedValue(flag)
    const onDone = vi.fn()
    const { result } = renderHook(() =>
      useFlagFormSave(null, [{ ...flag, sortOrder: 4 }], actionsWith({ createFlag }), onDone),
    )

    act(() => result.current.save(draft))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(createFlag).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 5, active: true }))
  })

  it('starts a first flag at sort order 0', async () => {
    const createFlag = vi.fn().mockResolvedValue(flag)
    const onDone = vi.fn()
    const { result } = renderHook(() =>
      useFlagFormSave(null, [], actionsWith({ createFlag }), onDone),
    )

    act(() => result.current.save(draft))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(createFlag).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 0 }))
  })

  it('updates an existing flag instead of creating one', async () => {
    const updateFlag = vi.fn().mockResolvedValue(undefined)
    const createFlag = vi.fn()
    const onDone = vi.fn()
    const { result } = renderHook(() =>
      useFlagFormSave(flag, [flag], actionsWith({ updateFlag, createFlag }), onDone),
    )

    act(() => result.current.save({ ...draft, name: 'Client travel' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(updateFlag).toHaveBeenCalledWith(7, expect.objectContaining({ name: 'Client travel' }))
    expect(createFlag).not.toHaveBeenCalled()
  })

  it('refuses a blank name without calling the API', () => {
    const createFlag = vi.fn()
    const onDone = vi.fn()
    const { result } = renderHook(() =>
      useFlagFormSave(null, [], actionsWith({ createFlag }), onDone),
    )

    act(() => result.current.save({ ...draft, name: '   ' }))

    expect(result.current.err).toBe('Enter a name')
    expect(createFlag).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('surfaces a server error and stays open', async () => {
    const createFlag = vi.fn().mockRejectedValue(new Error('Flag name is required'))
    const onDone = vi.fn()
    const { result } = renderHook(() =>
      useFlagFormSave(null, [], actionsWith({ createFlag }), onDone),
    )

    act(() => result.current.save(draft))

    await waitFor(() => expect(result.current.err).toBe('Flag name is required'))
    expect(onDone).not.toHaveBeenCalled()
    expect(result.current.busy).toBe(false)
  })

  it('deletes an existing flag', async () => {
    const deleteFlag = vi.fn().mockResolvedValue({ unflagged: 2 })
    const onDone = vi.fn()
    const { result } = renderHook(() =>
      useFlagFormSave(flag, [flag], actionsWith({ deleteFlag }), onDone),
    )

    act(() => result.current.remove())

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(deleteFlag).toHaveBeenCalledWith(7)
  })

  it('does nothing on delete when there is no flag yet', () => {
    const deleteFlag = vi.fn()
    const { result } = renderHook(() =>
      useFlagFormSave(null, [], actionsWith({ deleteFlag }), vi.fn()),
    )

    act(() => result.current.remove())

    expect(deleteFlag).not.toHaveBeenCalled()
  })
})
