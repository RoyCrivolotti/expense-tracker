import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BatchBar } from './BatchBar'

const baseProps = {
  totalCount: 10,
  onCancel: vi.fn(),
  onSelectAll: vi.fn(),
  onDeselectAll: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
}

describe('BatchBar', () => {
  it('says how many chosen rows the filter is hiding', () => {
    // Otherwise a narrowed list reads as a shrunken selection, which is the confusion
    // that made the old behaviour look like data loss.
    render(<BatchBar count={2} hiddenCount={3} busy={false} editOpen={false} {...baseProps} />)
    expect(screen.getByText(/3 not shown/)).toBeInTheDocument()
  })

  it('says nothing about hidden rows when there are none', () => {
    render(<BatchBar count={2} busy={false} editOpen={false} {...baseProps} />)
    expect(screen.queryByText(/not shown/)).not.toBeInTheDocument()
  })

  it('cannot be closed while an action is running', () => {
    render(<BatchBar count={2} busy={true} editOpen={false} {...baseProps} />)
    expect(screen.getByLabelText('Exit selection mode')).toBeDisabled()
  })

  it('shows "Deleting…" only when busy and edit is not open', () => {
    render(<BatchBar count={2} busy={true} editOpen={false} {...baseProps} />)
    expect(screen.getByText('Deleting…')).toBeInTheDocument()
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()
  })

  it('shows "Delete" when busy but edit is open', () => {
    render(<BatchBar count={2} busy={true} editOpen={true} {...baseProps} />)
    expect(screen.getByText('Delete')).toBeInTheDocument()
    expect(screen.queryByText('Deleting…')).not.toBeInTheDocument()
  })

  it('shows "Select all" when not all items are selected', () => {
    render(<BatchBar count={3} busy={false} editOpen={false} {...baseProps} />)
    expect(screen.getByText('Select all')).toBeInTheDocument()
  })

  it('shows "Deselect all" when all items are selected', () => {
    render(<BatchBar count={10} busy={false} editOpen={false} {...baseProps} />)
    expect(screen.getByText('Deselect all')).toBeInTheDocument()
  })

  it('renders close button with accessible label', () => {
    render(<BatchBar count={2} busy={false} editOpen={false} {...baseProps} />)
    expect(screen.getByLabelText('Exit selection mode')).toBeInTheDocument()
  })
})
