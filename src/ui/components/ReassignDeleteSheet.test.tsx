import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReassignDeleteSheet } from './ReassignDeleteSheet'

const OPTIONS = [
  { id: 2, name: 'Groceries' },
  { id: 3, name: 'Transport' },
]

describe('ReassignDeleteSheet', () => {
  it('defaults to the first existing option and confirms with reassignToId', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(
      <ReassignDeleteSheet
        title="Delete Dining?"
        message="In use by 2 records."
        options={OPTIONS}
        createLabel="category"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    expect(screen.getByLabelText<HTMLSelectElement>('Move to').value).toBe('2')
    expect(screen.queryByLabelText('New category name')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ reassignToId: 2 }))
  })

  it('switches to a name field when "create new" is selected and confirms with createName', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(
      <ReassignDeleteSheet
        title="Delete Dining?"
        message="In use by 2 records."
        options={OPTIONS}
        createLabel="category"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    fireEvent.change(screen.getByLabelText('Move to'), { target: { value: '__create__' } })
    const nameInput = screen.getByLabelText('New category name')
    expect(nameInput).toBeTruthy()

    // Blank name keeps the confirm button disabled.
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()

    fireEvent.change(nameInput, { target: { value: '  Dining out  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await vi.waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith({ createName: 'Dining out' }),
    )
  })

  it('defaults straight to "create new" when there are no other options', () => {
    render(
      <ReassignDeleteSheet
        title="Delete Dining?"
        message="In use by 2 records."
        options={[]}
        createLabel="category"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByLabelText<HTMLSelectElement>('Move to').value).toBe('__create__')
    expect(screen.getByLabelText('New category name')).toBeTruthy()
  })

  it('shows an error and re-enables the confirm button when onConfirm rejects', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('Category is in use'))
    render(
      <ReassignDeleteSheet
        title="Delete Dining?"
        message="In use by 2 records."
        options={OPTIONS}
        createLabel="category"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await screen.findByText('Category is in use')
    expect(screen.getByRole('button', { name: 'Delete' })).not.toBeDisabled()
  })
})
