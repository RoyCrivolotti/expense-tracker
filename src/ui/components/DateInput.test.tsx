import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// The fallback popover, not the native control — that is the branch min/max has to
// enforce itself.
vi.mock('../hooks/isNativeDatePicker', () => ({ isNativeDatePicker: () => false }))

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

describe('DateInput disabled reaches both pickers', () => {
  it('disables the popover trigger', () => {
    render(<DateInput value="2026-09-10" disabled onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Date' })).toBeDisabled()
  })
})
