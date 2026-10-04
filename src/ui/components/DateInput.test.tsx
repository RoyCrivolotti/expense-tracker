import { StrictMode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The fallback popover, not the native control — that is the branch min/max has to
// enforce itself.
vi.mock('../hooks/isNativeDatePicker', () => ({ isNativeDatePicker: () => false }))

import { setMotionDisabledForTests } from '../hooks/motion'
import { DateInput } from './DateInput'

async function openPicker(value: string, max?: string) {
  const onChange = vi.fn()
  const user = userEvent.setup()
  render(<DateInput value={value} max={max} onChange={onChange} />)
  await user.click(screen.getByRole('button', { name: 'Date' }))
  return { user, onChange }
}

describe('DateInput popover bounds', () => {
  it('disables days past max', async () => {
    await openPicker('2026-09-10', '2026-09-15')
    expect(screen.getByRole('button', { name: '15 September 2026' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '16 September 2026' })).toBeDisabled()
  })

  it('leaves every day selectable when no bound is given', async () => {
    await openPicker('2026-09-10')
    expect(screen.getByRole('button', { name: '16 September 2026' })).toBeEnabled()
  })

  it('ignores an out-of-range day even if its button is re-enabled', async () => {
    const { user, onChange } = await openPicker('2026-09-10', '2026-09-15')
    const out = screen.getByRole('button', { name: '16 September 2026' })
    out.removeAttribute('disabled')
    await user.click(out)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('reports a day inside the range and closes the popover', async () => {
    const { user, onChange } = await openPicker('2026-09-10', '2026-09-15')
    await user.click(screen.getByRole('button', { name: '14 September 2026' }))
    expect(onChange).toHaveBeenCalledWith('2026-09-14')
    expect(screen.queryByRole('dialog', { name: 'Choose a date' })).not.toBeInTheDocument()
  })

  it('applies today on reset and closes the popover', async () => {
    const { user, onChange } = await openPicker('2026-09-10')
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
    expect(screen.queryByRole('dialog', { name: 'Choose a date' })).not.toBeInTheDocument()
  })

  it('applies the focused day on Enter, same as a click', async () => {
    const { user, onChange } = await openPicker('2026-09-10')
    const day = screen.getByRole('button', { name: '14 September 2026' })
    day.focus()
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('2026-09-14')
    expect(screen.queryByRole('dialog', { name: 'Choose a date' })).not.toBeInTheDocument()
  })

  it('moves focus with arrow keys without applying a day', async () => {
    const { user, onChange } = await openPicker('2026-09-10')
    const day = screen.getByRole('button', { name: '14 September 2026' })
    day.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: '15 September 2026' })).toHaveFocus()
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('DateInput popover month navigation', () => {
  // StrictMode runs state updaters twice, which is how a year change nested inside
  // the month updater went wrong in dev and nowhere else.
  async function openStrict(value: string) {
    const user = userEvent.setup()
    render(
      <StrictMode>
        <DateInput value={value} onChange={vi.fn()} />
      </StrictMode>,
    )
    await user.click(screen.getByRole('button', { name: 'Date' }))
    return user
  }

  it('steps back across a January one year at a time', async () => {
    const user = await openStrict('2026-02-10')
    const prev = screen.getByRole('button', { name: 'Previous month' })

    await user.click(prev)
    expect(screen.getByText('January 2026')).toBeInTheDocument()
    await user.click(prev)
    expect(screen.getByText('December 2025')).toBeInTheDocument()
    await user.click(prev)
    expect(screen.getByText('November 2025')).toBeInTheDocument()
  })

  it('steps forward across a December one year at a time', async () => {
    const user = await openStrict('2026-11-10')
    const next = screen.getByRole('button', { name: 'Next month' })

    await user.click(next)
    expect(screen.getByText('December 2026')).toBeInTheDocument()
    await user.click(next)
    expect(screen.getByText('January 2027')).toBeInTheDocument()
    await user.click(next)
    expect(screen.getByText('February 2027')).toBeInTheDocument()
  })

  it('lands on the same month a year earlier after twelve steps back', async () => {
    const user = await openStrict('2026-04-10')
    for (let i = 0; i < 12; i++) await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByText('April 2025')).toBeInTheDocument()
  })
})

describe('DateInput disabled reaches both pickers', () => {
  it('disables the popover trigger', () => {
    render(<DateInput value="2026-09-10" disabled onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Date' })).toBeDisabled()
  })

  it('shows the placeholder while empty, its own or the default', () => {
    const { rerender } = render(<DateInput value="" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Date' })).toHaveTextContent('Select date')

    rerender(<DateInput value="" placeholder="Target date" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Date' })).toHaveTextContent('Target date')
  })
})

describe('DateInput — pausing the enclosing modal trap', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setMotionDisabledForTests(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    setMotionDisabledForTests(true)
  })

  it('reports open and close synchronously; the owner defers the un-pause', () => {
    // The exit-length deferral lives in usePopoverTrapPause, at the single owner, so a
    // late un-pause can never race another popover's pause — see that hook's tests.
    const onTrapPausedChange = vi.fn()
    render(<DateInput value="2026-09-10" onChange={vi.fn()} onTrapPausedChange={onTrapPausedChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Date' }))
    expect(onTrapPausedChange).toHaveBeenLastCalledWith(true)

    fireEvent.click(screen.getByRole('button', { name: '14 September 2026' }))
    expect(onTrapPausedChange).toHaveBeenLastCalledWith(false)
  })
})
