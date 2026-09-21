import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyGroupGrants } from '../../domain/accessGroups'
import { EXIT_MS, setMotionDisabledForTests } from '../hooks/motion'
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

  it('asks to add a transaction when it is pressed', () => {
    const onAdd = vi.fn()
    render(
      <AppShell {...baseProps} onAdd={onAdd}>
        content
      </AppShell>,
    )

    fireEvent.click(screen.getByLabelText('Add transaction'))

    expect(onAdd).toHaveBeenCalledTimes(1)
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

describe('AppShell fab leaving', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setMotionDisabledForTests(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    setMotionDisabledForTests(true)
  })

  it('scales away when the selection bar takes its corner, and still adds if pressed on the way out of the DOM', () => {
    const onAdd = vi.fn()
    const { rerender } = render(
      <AppShell {...baseProps} onAdd={onAdd}>
        content
      </AppShell>,
    )
    const fab = screen.getByLabelText('Add transaction')
    expect(fab.className).not.toMatch(/fabLeaving/)

    rerender(<AppShell {...baseProps}>content</AppShell>)

    expect(fab.className).toMatch(/fabLeaving/)
    expect(fab.hasAttribute('inert')).toBe(true)

    act(() => {
      vi.advanceTimersByTime(EXIT_MS.fade)
    })
    expect(screen.queryByLabelText('Add transaction')).not.toBeInTheDocument()
  })

  it('comes back as a fresh button when the corner is free again', () => {
    const { rerender } = render(
      <AppShell {...baseProps} onAdd={vi.fn()}>
        content
      </AppShell>,
    )
    rerender(<AppShell {...baseProps}>content</AppShell>)
    rerender(
      <AppShell {...baseProps} onAdd={vi.fn()}>
        content
      </AppShell>,
    )

    const fab = screen.getByLabelText('Add transaction')
    expect(fab.className).not.toMatch(/fabLeaving/)
    expect(fab.hasAttribute('inert')).toBe(false)
  })
})
