import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DayOfMonthInput } from './DayOfMonthInput'
import { ordinalDay } from './dayOfMonth'

async function openPicker(value: number) {
  const onChange = vi.fn()
  const user = userEvent.setup()
  render(<DayOfMonthInput value={value} ariaLabel="Start day" onChange={onChange} />)
  await user.click(screen.getByRole('button', { name: 'Start day' }))
  return { user, onChange }
}

describe('ordinalDay', () => {
  it('uses st, nd, rd and th, with the teens all th', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 28].map(ordinalDay)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '28th',
    ])
  })
})

describe('DayOfMonthInput', () => {
  it('shows the day on the trigger', () => {
    render(<DayOfMonthInput value={13} ariaLabel="Start day" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Start day' })).toHaveTextContent('13th')
  })

  it('offers days 1 to 28 and nothing else', async () => {
    await openPicker(1)
    expect(screen.getByRole('button', { name: '1st' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '28th' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '29th' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('grid')[0]!.querySelectorAll('button')).toHaveLength(28)
  })

  it('marks the current day as selected', async () => {
    await openPicker(13)
    expect(screen.getByRole('button', { name: '13th' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '14th' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('applies the clicked day and closes the popover', async () => {
    const { user, onChange } = await openPicker(1)
    await user.click(screen.getByRole('button', { name: '22nd' }))
    expect(onChange).toHaveBeenCalledWith(22)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('goes back to calendar months with one tap', async () => {
    const { user, onChange } = await openPicker(13)
    await user.click(screen.getByRole('button', { name: 'Calendar months' }))
    expect(onChange).toHaveBeenCalledWith(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('moves between days with the arrow keys, a week at a time vertically', async () => {
    const { user } = await openPicker(13)
    screen.getByRole('button', { name: '13th' }).focus()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: '14th' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('button', { name: '21st' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('button', { name: '20th' })).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('button', { name: '13th' })).toHaveFocus()
  })

  it('stays put at the edge of the grid', async () => {
    const { user } = await openPicker(28)
    screen.getByRole('button', { name: '28th' }).focus()
    await user.keyboard('{ArrowRight}{ArrowDown}')
    expect(screen.getByRole('button', { name: '28th' })).toHaveFocus()
  })

  it('closes on Escape without choosing', async () => {
    const { user, onChange } = await openPicker(13)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })
})
