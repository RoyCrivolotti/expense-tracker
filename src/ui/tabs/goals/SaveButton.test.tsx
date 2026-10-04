import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setMotionDisabledForTests } from '../../hooks/motion'
import { ToastProvider } from '../../hooks/ToastProvider'
import { ToastContext } from '../../hooks/useToast'
import { NAME_HINT, SaveButton } from './SaveButton'

function setup(props: { unnamed: boolean; disabled?: boolean }) {
  const onSave = vi.fn()
  const showToast = vi.fn()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ToastContext.Provider value={{ showToast }}>{children}</ToastContext.Provider>
  )
  const view = render(
    <SaveButton className="b" onSave={onSave} {...props}>
      Save
    </SaveButton>,
    { wrapper },
  )
  return { onSave, showToast, ...view }
}

describe('SaveButton', () => {
  it('saves when there is a name, and carries no reason', async () => {
    const { onSave, showToast } = setup({ unnamed: false })
    const save = screen.getByRole('button', { name: 'Save' })

    await userEvent.click(save)

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(showToast).not.toHaveBeenCalled()
    expect(save).toBeEnabled()
    expect(save).not.toHaveAttribute('aria-disabled')
    expect(save).not.toHaveAttribute('aria-describedby')
    expect(save).not.toHaveAttribute('title')
    expect(screen.queryByText(NAME_HINT)).not.toBeInTheDocument()
  })

  it('is off with no name but still takes the press: aria-disabled, not disabled, and a tooltip', () => {
    setup({ unnamed: true })
    const save = screen.getByRole('button', { name: 'Save' })

    expect(save).toHaveAttribute('aria-disabled', 'true')
    expect(save).not.toBeDisabled()
    expect(save).toHaveAttribute('title', NAME_HINT)
  })

  it('explains instead of saving when pressed, and does it for the keyboard too', async () => {
    const { onSave, showToast } = setup({ unnamed: true })
    const save = screen.getByRole('button', { name: 'Save' })

    await userEvent.click(save)
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenLastCalledWith(NAME_HINT)

    save.focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    expect(showToast).toHaveBeenCalledTimes(3)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('gives a screen reader the reason as its description, from words nobody sees', () => {
    setup({ unnamed: true })
    const save = screen.getByRole('button', { name: 'Save' })

    expect(save).toHaveAccessibleDescription(NAME_HINT)
    // In the page for a reader, kept out of sight by its class.
    expect(screen.getByText(NAME_HINT).className).toMatch(/srOnly/)
  })

  it('has nothing to say while a save is in flight: it is disabled, and silent', async () => {
    const { onSave, showToast } = setup({ unnamed: true, disabled: true })
    const save = screen.getByRole('button', { name: 'Save' })

    expect(save).toBeDisabled()
    expect(save).not.toHaveAttribute('aria-disabled')
    expect(save).not.toHaveAttribute('title')
    expect(screen.queryByText(NAME_HINT)).not.toBeInTheDocument()
    await userEvent.click(save)
    expect(onSave).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
  })

  it('saves again as soon as there is a name', async () => {
    function Harness() {
      const [name, setName] = useState('')
      return (
        <>
          <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <SaveButton className="b" unnamed={name.trim() === ''} onSave={onSave}>
            Save
          </SaveButton>
        </>
      )
    }
    const onSave = vi.fn()
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true')

    await userEvent.type(screen.getByLabelText('Name'), 'Path A')
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).not.toHaveAttribute('aria-disabled')
    expect(save).not.toHaveAccessibleDescription(NAME_HINT)
    await userEvent.click(save)
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  describe('with the real toast', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      setMotionDisabledForTests(true)
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('shows one toast in a neutral tone, however many times it is pressed, and lets it go', async () => {
      render(
        <ToastProvider>
          <SaveButton className="b" unnamed onSave={vi.fn()}>
            Save
          </SaveButton>
        </ToastProvider>,
      )
      const save = screen.getByRole('button', { name: 'Save' })
      // The message also sits hidden as the button's description; the toast is the live region.
      const toast = () => screen.queryAllByRole('status')

      expect(toast()).toHaveLength(0)
      await userEvent.click(save)
      await userEvent.click(save)
      await userEvent.click(save)

      expect(toast()).toHaveLength(1)
      expect(toast()[0]).toHaveTextContent(NAME_HINT)
      // The plain tone is the one with no colour class of its own: not an error, not a success.
      expect(toast()[0]!.querySelector('[class*="error"], [class*="success"]')).toBeNull()

      act(() => {
        vi.advanceTimersByTime(2600)
      })
      expect(toast()).toHaveLength(0)
    })
  })
})
