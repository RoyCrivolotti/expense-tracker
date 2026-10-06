import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeMatchMedia } from '../../../../testing/fakeMatchMedia'
import { Presence } from '../../../components/Presence'
import { setMotionDisabledForTests } from '../../../hooks/motion'
import { isBodyScrollLocked } from '../../../hooks/useBodyScrollLock'
import { SheetFrame } from './SheetFrame'
import { SIDEWAYS_MQ } from './sheetOrientation'

beforeEach(() => {
  installFakeMatchMedia()
})

afterEach(() => {
  vi.useRealTimers()
  setMotionDisabledForTests(true)
  installFakeMatchMedia()
})

/** A page with a button that opens the frame, as a card does, and something inside it to focus. */
function Card({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Presence show={open} exitMs={130}>
        <SheetFrame
          title="A sheet"
          label="A sheet, with everything"
          toolbar={<button type="button">Tool</button>}
          onClose={() => {
            onClose()
            setOpen(false)
          }}
        >
          <p>What it is about</p>
        </SheetFrame>
      </Presence>
    </>
  )
}

const dialog = () => screen.getByRole('dialog', { name: 'A sheet, with everything' })

describe('SheetFrame', () => {
  it('is a modal dialog on the body, with a title, its tools, its content and a close button', async () => {
    render(<Card />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(dialog().parentElement).toBe(document.body)
    expect(dialog()).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog()).getByRole('heading', { name: 'A sheet' })).toBeInTheDocument()
    expect(within(dialog()).getByRole('button', { name: 'Tool' })).toBeInTheDocument()
    expect(within(dialog()).getByText('What it is about')).toBeInTheDocument()
    expect(within(dialog()).getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('holds the page still while it is open, and lets it go when it closes', async () => {
    render(<Card />)
    expect(isBodyScrollLocked()).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(isBodyScrollLocked()).toBe(true)
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Close' }))
    expect(isBodyScrollLocked()).toBe(false)
  })

  it('moves focus into the sheet and gives it back to what opened it', async () => {
    render(<Card />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await userEvent.click(opener)
    expect(dialog().contains(document.activeElement)).toBe(true)

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(<Card onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is drawn as it is, with no line about turning the phone, unless the phone is upright', () => {
    render(<Card />)
    act(() => screen.getByRole('button', { name: 'Open' }).click())
    expect(dialog().className).not.toMatch(/sheetSideways/)
    expect(screen.queryByText(/Turn your phone to the left/)).not.toBeInTheDocument()
  })

  it('is drawn a quarter turn, with a line that says so, on an upright phone, and follows the phone turning', async () => {
    const media = installFakeMatchMedia((q) => q === SIDEWAYS_MQ)
    render(<Card />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(dialog().className).toMatch(/sheetSideways/)
    expect(screen.getByText('Turn your phone to the left to read this.')).toBeInTheDocument()

    act(() => media.change(SIDEWAYS_MQ, false))
    await vi.waitFor(() => expect(dialog().className).not.toMatch(/sheetSideways/))
    expect(screen.queryByText(/Turn your phone to the left/)).not.toBeInTheDocument()
  })

  it('stays for its exit with the page already released, cannot be acted on, and carries the exit time', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    setMotionDisabledForTests(false)
    render(<Card />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }))
    // Still there, playing its exit, but the page behind it is already free and it takes no input.
    expect(dialog()).toBeInTheDocument()
    expect(dialog()).toHaveAttribute('inert')
    expect(dialog().style.getPropertyValue('--exit-ms')).toBe('130ms')
    expect(isBodyScrollLocked()).toBe(false)

    void act(() => vi.advanceTimersByTime(130))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
