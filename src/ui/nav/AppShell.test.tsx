import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptyGroupGrants } from '../../domain/accessGroups'
import { AppShell } from './AppShell'

const baseProps = {
  activeId: 'dashboard' as const,
  onSelect: vi.fn(),
  title: 'Expenses',
  hubGrants: emptyGroupGrants(),
}

describe('AppShell fab', () => {
  it('renders the add-transaction fab only when onAdd is provided', () => {
    const { rerender } = render(
      <AppShell {...baseProps} onAdd={vi.fn()}>
        content
      </AppShell>,
    )
    expect(screen.getByLabelText('Add transaction')).toBeInTheDocument()

    rerender(<AppShell {...baseProps}>content</AppShell>)
    expect(screen.queryByLabelText('Add transaction')).not.toBeInTheDocument()
  })

  it('hides the fab while the page scrolls and shows it again once settled', () => {
    vi.useFakeTimers()
    try {
      render(
        <AppShell {...baseProps} onAdd={vi.fn()}>
          content
        </AppShell>,
      )
      const fab = screen.getByLabelText('Add transaction')
      expect(fab.className).not.toMatch(/fabHidden/)

      act(() => {
        fireEvent.scroll(window)
      })
      expect(fab.className).toMatch(/fabHidden/)

      act(() => {
        vi.advanceTimersByTime(250)
      })
      expect(fab.className).not.toMatch(/fabHidden/)
    } finally {
      vi.useRealTimers()
    }
  })
})
