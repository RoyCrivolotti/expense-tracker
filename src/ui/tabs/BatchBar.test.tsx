import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BatchBar } from './BatchBar'

describe('BatchBar', () => {
  it('shows "Deleting…" only when busy and edit is not open', () => {
    render(
      <BatchBar count={2} busy={true} editOpen={false} onEdit={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(screen.getByText('Deleting…')).toBeInTheDocument()
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()
  })

  it('shows "Delete" when busy but edit is open', () => {
    render(
      <BatchBar count={2} busy={true} editOpen={true} onEdit={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(screen.getByText('Delete')).toBeInTheDocument()
    expect(screen.queryByText('Deleting…')).not.toBeInTheDocument()
  })
})
