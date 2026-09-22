import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The fallback popover, not the native control — same reasoning as DateInput.test.tsx.
vi.mock('../hooks/isNativeDatePicker', () => ({ isNativeDatePicker: () => false }))

import { EXIT_MS, setMotionDisabledForTests } from '../hooks/motion'
import { MonthInput } from './MonthInput'

async function openPicker(value: string) {
  const onChange = vi.fn()
  const user = userEvent.setup()
  render(<MonthInput value={value} onChange={onChange} />)
  await user.click(screen.getByRole('button', { name: 'Budget month' }))
  return { user, onChange }
}

describe('MonthInput popover', () => {
  it('applies the clicked month and closes the popover', async () => {
    const { user, onChange } = await openPicker('2026-09')
    await user.click(screen.getByRole('button', { name: 'Nov 2026' }))
    expect(onChange).toHaveBeenCalledWith('2026-11')
    expect(screen.queryByRole('dialog', { name: 'Choose a month' })).not.toBeInTheDocument()
  })

  it('marks the current value as selected', async () => {
    await openPicker('2026-09')
    expect(screen.getByRole('button', { name: 'Sep 2026' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Nov 2026' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('applies the current month on reset and closes the popover', async () => {
    const { user, onChange } = await openPicker('2020-01')
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}$/))
    expect(screen.queryByRole('dialog', { name: 'Choose a month' })).not.toBeInTheDocument()
  })
})

describe('MonthInput — pausing the enclosing modal trap', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setMotionDisabledForTests(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    setMotionDisabledForTests(true)
  })

  it('keeps the trap paused through the popover\'s own exit, not just until it is asked to close', async () => {
    const onTrapPausedChange = vi.fn()
    render(<MonthInput value="2026-09" onChange={vi.fn()} onTrapPausedChange={onTrapPausedChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Budget month' }))
    expect(onTrapPausedChange).toHaveBeenLastCalledWith(true)

    fireEvent.click(screen.getByRole('button', { name: 'Nov 2026' }))
    expect(onTrapPausedChange).toHaveBeenLastCalledWith(true)

    await act(() => vi.advanceTimersByTimeAsync(EXIT_MS.popover))
    expect(onTrapPausedChange).toHaveBeenLastCalledWith(false)
  })
})
