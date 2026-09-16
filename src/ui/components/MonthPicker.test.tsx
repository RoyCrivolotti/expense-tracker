import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MonthPicker } from './MonthPicker'

const MONTHS = ['2026-05', '2026-06', '2026-07']

describe('MonthPicker', () => {
  it('steps between months and jumps to the latest', async () => {
    const onChange = vi.fn()
    render(<MonthPicker months={MONTHS} value="2026-06" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))

    expect(onChange.mock.calls).toEqual([['2026-05'], ['2026-07']])
  })

  it('refuses every way of changing month while locked, and says why', async () => {
    const onChange = vi.fn()
    render(<MonthPicker months={MONTHS} value="2026-06" onChange={onChange} disabled />)
    const controls = [
      screen.getByRole('button', { name: 'Previous month' }),
      screen.getByRole('button', { name: 'Next month' }),
      screen.getByRole('button', { name: 'Go to latest budget month' }),
    ]

    for (const control of controls) {
      expect(control).toBeDisabled()
      await userEvent.click(control)
    }

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByTitle('Finish or cancel the selection to change month')).toBeInTheDocument()
  })
})
