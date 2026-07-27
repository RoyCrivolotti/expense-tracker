import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmSheet } from './ConfirmSheet'

describe('ConfirmSheet', () => {
  it('renders a plain string message as a single paragraph', () => {
    render(
      <ConfirmSheet
        title="Delete?"
        message="This can't be undone."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText("This can't be undone.")).toBeTruthy()
  })

  it('renders a string array message as separate list items', () => {
    render(
      <ConfirmSheet
        title="Apply?"
        message={['2 new categories: Groceries, Rent', '1 new account: Main debit']}
        confirmLabel="Apply"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText('2 new categories: Groceries, Rent')).toBeTruthy()
    expect(screen.getByText('1 new account: Main debit')).toBeTruthy()
  })

  it('renders the footnote below the message when provided, and omits it when absent', () => {
    const { rerender } = render(
      <ConfirmSheet
        title="Apply?"
        message="Something will happen."
        footnote="A fixed caveat."
        confirmLabel="Apply"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText('A fixed caveat.')).toBeTruthy()

    rerender(
      <ConfirmSheet
        title="Apply?"
        message="Something will happen."
        confirmLabel="Apply"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByText('A fixed caveat.')).toBeNull()
  })

  it('references both message and footnote ids in aria-describedby only when a footnote is present', () => {
    const { rerender } = render(
      <ConfirmSheet
        title="Apply?"
        message="Something will happen."
        confirmLabel="Apply"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('alertdialog')).toHaveAttribute('aria-describedby', 'confirm-message')

    rerender(
      <ConfirmSheet
        title="Apply?"
        message="Something will happen."
        footnote="A fixed caveat."
        confirmLabel="Apply"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('alertdialog')).toHaveAttribute(
      'aria-describedby',
      'confirm-message confirm-footnote',
    )
  })
})
