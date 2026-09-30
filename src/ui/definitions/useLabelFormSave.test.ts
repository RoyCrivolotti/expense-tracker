import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Label } from '../../types'
import type { ExpenseActions } from '../actions'
import { initialLabelDraft, useLabelFormSave } from './useLabelFormSave'

const label: Label = {
  id: 7,
  name: 'Japan trip',
  color: '#6366f1',
  description: 'Spring 2027',
  sortOrder: 2,
  active: true,
}

function actionsWith(overrides: Partial<ExpenseActions>): ExpenseActions {
  return {
    createLabel: vi.fn().mockResolvedValue(label),
    updateLabel: vi.fn().mockResolvedValue(undefined),
    deleteLabel: vi.fn().mockResolvedValue({ unlabeled: 0 }),
    ...overrides,
  } as unknown as ExpenseActions
}

const draft = { name: 'Japan trip', description: '', color: '#6366f1', active: true }

describe('initialLabelDraft', () => {
  it('opens empty for a new label, with the default colour', () => {
    expect(initialLabelDraft(null, '#abcdef')).toEqual({
      name: '',
      description: '',
      color: '#abcdef',
      active: true,
    })
  })

  it('opens from an existing label', () => {
    expect(initialLabelDraft(label, '#abcdef')).toEqual({
      name: 'Japan trip',
      description: 'Spring 2027',
      color: '#6366f1',
      active: true,
    })
  })

  it('treats a missing description as empty rather than undefined', () => {
    const bare = { ...label }
    delete bare.description

    expect(initialLabelDraft(bare, '#abcdef').description).toBe('')
  })
})

describe('useLabelFormSave', () => {
  it('creates a label at the end of the existing order', async () => {
    const createLabel = vi.fn().mockResolvedValue(label)
    const onDone = vi.fn()
    const { result } = renderHook(() =>
      useLabelFormSave(null, [{ ...label, sortOrder: 4 }], actionsWith({ createLabel }), onDone),
    )

    act(() => result.current.save(draft))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(createLabel).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 5, active: true }))
  })

  it('starts a first label at sort order 0', async () => {
    const createLabel = vi.fn().mockResolvedValue(label)
    const onDone = vi.fn()
    const { result } = renderHook(() =>
      useLabelFormSave(null, [], actionsWith({ createLabel }), onDone),
    )

    act(() => result.current.save(draft))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(createLabel).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 0 }))
  })

  it('updates an existing label instead of creating one', async () => {
    const updateLabel = vi.fn().mockResolvedValue(undefined)
    const createLabel = vi.fn()
    const onDone = vi.fn()
    const { result } = renderHook(() =>
      useLabelFormSave(label, [label], actionsWith({ updateLabel, createLabel }), onDone),
    )

    act(() => result.current.save({ ...draft, name: 'Osaka trip' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(updateLabel).toHaveBeenCalledWith(7, expect.objectContaining({ name: 'Osaka trip' }))
    expect(createLabel).not.toHaveBeenCalled()
  })

  it('refuses a blank name without calling the API', () => {
    const createLabel = vi.fn()
    const onDone = vi.fn()
    const { result } = renderHook(() =>
      useLabelFormSave(null, [], actionsWith({ createLabel }), onDone),
    )

    act(() => result.current.save({ ...draft, name: '   ' }))

    expect(result.current.err).toBe('Enter a name')
    expect(createLabel).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('surfaces a server error and stays open', async () => {
    const createLabel = vi.fn().mockRejectedValue(new Error('Label name is required'))
    const onDone = vi.fn()
    const { result } = renderHook(() =>
      useLabelFormSave(null, [], actionsWith({ createLabel }), onDone),
    )

    act(() => result.current.save(draft))

    await waitFor(() => expect(result.current.err).toBe('Label name is required'))
    expect(onDone).not.toHaveBeenCalled()
    expect(result.current.busy).toBe(false)
  })

  it('deletes an existing label', async () => {
    const deleteLabel = vi.fn().mockResolvedValue({ unlabeled: 2 })
    const onDone = vi.fn()
    const { result } = renderHook(() =>
      useLabelFormSave(label, [label], actionsWith({ deleteLabel }), onDone),
    )

    act(() => result.current.remove())

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(deleteLabel).toHaveBeenCalledWith(7)
  })

  it('does nothing on delete when there is no label yet', () => {
    const deleteLabel = vi.fn()
    const { result } = renderHook(() =>
      useLabelFormSave(null, [], actionsWith({ deleteLabel }), vi.fn()),
    )

    act(() => result.current.remove())

    expect(deleteLabel).not.toHaveBeenCalled()
  })
})
