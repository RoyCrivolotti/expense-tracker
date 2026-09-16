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

  it('stops at either end of the range', () => {
    render(<MonthPicker months={MONTHS} value="2026-05" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
  })

  it('answers every way of changing month with the reason while locked', async () => {
    // Pressable rather than disabled, since a disabled button never hears the tap. The one
    // at the end of the range answers too, so the three behave alike.
    const onChange = vi.fn()
    const onLockedPress = vi.fn()
    render(
      <MonthPicker
        months={MONTHS}
        value="2026-05"
        onChange={onChange}
        locked
        onLockedPress={onLockedPress}
      />,
    )
    const controls = [
      screen.getByRole('button', { name: 'Previous month' }),
      screen.getByRole('button', { name: 'Next month' }),
      screen.getByRole('button', { name: 'Go to latest budget month' }),
    ]

    for (const control of controls) {
      expect(control).toHaveAttribute('aria-disabled', 'true')
      await userEvent.click(control)
    }

    expect(onChange).not.toHaveBeenCalled()
    expect(onLockedPress).toHaveBeenCalledTimes(3)
  })

  it('stays reachable from the keyboard while locked, so the reason is too', async () => {
    const onLockedPress = vi.fn()
    render(
      <MonthPicker months={MONTHS} value="2026-06" onChange={vi.fn()} locked onLockedPress={onLockedPress} />,
    )

    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Previous month' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')

    expect(onLockedPress).toHaveBeenCalledTimes(1)
  })
})
