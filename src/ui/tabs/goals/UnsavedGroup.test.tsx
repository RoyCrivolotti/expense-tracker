import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ToastContext } from '../../hooks/useToast'
import { UnsavedGroup } from './UnsavedGroup'

const HINT = 'Give the scenario a name to save it'
const unsaved = (name: string) => ({ name, saving: false, onSave: vi.fn(), onDiscard: vi.fn() })

function setup(name: string) {
  const showToast = vi.fn()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ToastContext.Provider value={{ showToast }}>{children}</ToastContext.Provider>
  )
  const actions = unsaved(name)
  const view = render(<UnsavedGroup unsaved={actions} onGone={vi.fn()} />, { wrapper })
  return { actions, showToast, ...view }
}

describe('UnsavedGroup', () => {
  it('turns Save off for a scenario with no name, but leaves it taking the press so it can say why', async () => {
    const { actions, showToast } = setup('  ')

    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toHaveAttribute('aria-disabled', 'true')
    expect(save).not.toBeDisabled()
    expect(save).toHaveAttribute('title', HINT)
    expect(save).toHaveAccessibleDescription(HINT)

    await userEvent.click(save)
    expect(showToast).toHaveBeenCalledWith(HINT)
    expect(actions.onSave).not.toHaveBeenCalled()
  })

  it('writes the reason nowhere in the page, so nothing is laid out for it', () => {
    setup('')
    // Only the description a screen reader has, which is clipped to a pixel.
    expect(screen.getAllByText(HINT)).toHaveLength(1)
    expect(screen.getByText(HINT).className).toMatch(/srOnly/)
  })

  it('keeps Discard working while Save is off', async () => {
    const { actions } = setup('')
    const discard = screen.getByRole('button', { name: 'Discard changes' })
    expect(discard).toBeEnabled()
    await userEvent.click(discard)
    expect(actions.onDiscard).toHaveBeenCalledTimes(1)
  })

  it('saves under the scenario\'s name once there is one, with no reason left behind', async () => {
    const { actions, showToast, rerender } = setup('')
    rerender(<UnsavedGroup unsaved={{ ...actions, name: 'Path A' }} onGone={vi.fn()} />)

    const save = screen.getByRole('button', { name: 'Save changes to Path A' })
    expect(save).not.toHaveAttribute('aria-disabled')
    expect(save).not.toHaveAttribute('title')
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
    await userEvent.click(save)
    expect(actions.onSave).toHaveBeenCalledTimes(1)
    expect(showToast).not.toHaveBeenCalled()
  })

  it('disables Save and Discard for a write in flight, with no reason to give', () => {
    const { actions, rerender } = setup('Path A')
    rerender(<UnsavedGroup unsaved={{ ...actions, saving: true }} onGone={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Save changes to Path A' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled()
  })

  it('does not explain a Save that a write in flight has turned off', () => {
    const { actions, rerender } = setup('')
    rerender(<UnsavedGroup unsaved={{ ...actions, saving: true }} onGone={vi.fn()} />)

    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled()
    expect(save).not.toHaveAttribute('aria-disabled')
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
  })
})
