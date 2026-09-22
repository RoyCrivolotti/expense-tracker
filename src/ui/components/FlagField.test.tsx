import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeFlag } from '../../testing/factories'
import { EXIT_MS, setMotionDisabledForTests } from '../hooks/motion'
import { FlagField } from './FlagField'

const work = makeFlag({ id: 1, name: 'Work travel' })
const tax = makeFlag({ id: 2, name: 'Tax deductible', color: '#10b981', sortOrder: 1 })

function renderField(props: Partial<Parameters<typeof FlagField>[0]> = {}) {
  const onChange = vi.fn()
  const onTrapPausedChange = vi.fn()
  render(
    <FlagField
      flags={[work, tax]}
      value={null}
      onChange={onChange}
      onTrapPausedChange={onTrapPausedChange}
      {...props}
    />,
  )
  return { onChange, onTrapPausedChange }
}

describe('FlagField', () => {
  it('reads "No flag" when nothing is applied', () => {
    renderField()

    expect(screen.getByRole('button', { name: /No flag/ })).toBeInTheDocument()
  })

  it('names the applied flag', () => {
    renderField({ value: 1 })

    expect(screen.getByRole('button', { name: /Work travel/ })).toBeInTheDocument()
  })

  it('is present before any flag exists, so the feature is discoverable', async () => {
    // The Flagged card hides itself when nothing is flagged, so if this hid too
    // there would be no trace of flags anywhere in the Transactions tab.
    render(<FlagField flags={[]} value={null} onChange={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: /No flag/ }))

    expect(screen.getByText(/Settings/)).toBeInTheDocument()
  })

  it('opens the picker and reports a choice', async () => {
    const { onChange } = renderField()

    await userEvent.click(screen.getByRole('button', { name: /No flag/ }))
    await userEvent.click(screen.getByRole('button', { name: /Tax deductible/ }))

    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('pauses the enclosing modal focus trap while the picker is open', async () => {
    // Without this the Modal's own Escape handler closes the whole editor and
    // its trap pulls focus back out of the portalled popover.
    const { onTrapPausedChange } = renderField()

    await userEvent.click(screen.getByRole('button', { name: /No flag/ }))
    expect(onTrapPausedChange).toHaveBeenLastCalledWith(true)

    await userEvent.click(screen.getByRole('button', { name: /Work travel/ }))
    expect(onTrapPausedChange).toHaveBeenLastCalledWith(false)
  })

  it('marks the trigger as a dialog opener for assistive tech', async () => {
    renderField()
    const trigger = screen.getByRole('button', { name: /No flag/ })

    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('FlagField — un-pausing the modal trap', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setMotionDisabledForTests(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    setMotionDisabledForTests(true)
  })

  it('keeps the trap paused through the popover\'s own exit, not just until it is asked to close', async () => {
    const { onTrapPausedChange } = renderField()

    fireEvent.click(screen.getByRole('button', { name: /No flag/ }))
    fireEvent.click(screen.getByRole('button', { name: /Work travel/ }))

    expect(onTrapPausedChange).toHaveBeenLastCalledWith(true)

    await act(() => vi.advanceTimersByTimeAsync(EXIT_MS.popover - 1))
    expect(onTrapPausedChange).toHaveBeenLastCalledWith(true)

    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(onTrapPausedChange).toHaveBeenLastCalledWith(false)
  })

  it('does not let a stale close un-pause the trap once the popover has reopened', async () => {
    const { onTrapPausedChange } = renderField()

    fireEvent.click(screen.getByRole('button', { name: /No flag/ }))
    fireEvent.click(screen.getByRole('button', { name: /Work travel/ }))
    // Reopen before the first close's delayed un-pause has had a chance to fire. `value`
    // is a controlled prop this harness never updates, so the trigger still reads "No
    // flag" — `expanded: false` picks the trigger out from the still-mounted, exiting
    // popover's own same-named option.
    fireEvent.click(screen.getByRole('button', { name: /No flag/, expanded: false }))

    await act(() => vi.advanceTimersByTimeAsync(EXIT_MS.popover))
    expect(onTrapPausedChange).toHaveBeenLastCalledWith(true)
  })
})
