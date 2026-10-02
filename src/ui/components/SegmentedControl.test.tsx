import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from './SegmentedControl'

const options = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
]

describe('SegmentedControl', () => {
  it('calls onChange with the clicked option', () => {
    const onChange = vi.fn()
    render(<SegmentedControl options={options} value="a" onChange={onChange} ariaLabel="Test" />)
    fireEvent.click(screen.getByRole('radio', { name: 'B' }))
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('marks the active option checked', () => {
    render(<SegmentedControl options={options} value="b" onChange={vi.fn()} ariaLabel="Test" />)
    expect(screen.getByRole('radio', { name: 'A' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'B' })).toHaveAttribute('aria-checked', 'true')
  })

  it('is a tall bar only when the bar layout is asked for the tall size', () => {
    const tall = (props: { layout?: 'compact' | 'bar' | 'scroll'; size?: 'default' | 'tall' }) =>
      render(
        <SegmentedControl options={options} value="a" onChange={vi.fn()} ariaLabel="Test" {...props} />,
      ).getByRole('radiogroup').className.includes('tall')

    expect(tall({ layout: 'bar', size: 'tall' })).toBe(true)
    cleanup()
    expect(tall({ layout: 'bar' })).toBe(false)
    cleanup()
    expect(tall({ layout: 'compact', size: 'tall' })).toBe(false)
  })

  describe('with the keyboard', () => {
    const three = [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
      { value: 'c', label: 'C' },
    ]

    /** The group, held by the test the way a page holds the selection. */
    function Group({ start }: { start: string }) {
      const [value, setValue] = useState(start)
      return <SegmentedControl options={three} value={value} onChange={setValue} ariaLabel="Test" />
    }

    it('has one tab stop, on the selected option', () => {
      render(<Group start="b" />)

      expect(screen.getByRole('radio', { name: 'A' })).toHaveAttribute('tabindex', '-1')
      expect(screen.getByRole('radio', { name: 'B' })).toHaveAttribute('tabindex', '0')
      expect(screen.getByRole('radio', { name: 'C' })).toHaveAttribute('tabindex', '-1')
    })

    it('puts the tab stop on the first option when none is selected', () => {
      render(<SegmentedControl options={three} value="none" onChange={vi.fn()} ariaLabel="Test" />)

      expect(screen.getByRole('radio', { name: 'A' })).toHaveAttribute('tabindex', '0')
    })

    it('moves the selection and the focus with the arrow keys, wrapping at the ends', async () => {
      const user = userEvent.setup()
      render(<Group start="a" />)
      screen.getByRole('radio', { name: 'A' }).focus()

      await user.keyboard('{ArrowRight}')
      expect(screen.getByRole('radio', { name: 'B' })).toBeChecked()
      expect(screen.getByRole('radio', { name: 'B' })).toHaveFocus()

      await user.keyboard('{ArrowDown}{ArrowDown}')
      expect(screen.getByRole('radio', { name: 'A' })).toBeChecked()

      await user.keyboard('{ArrowLeft}')
      expect(screen.getByRole('radio', { name: 'C' })).toBeChecked()
      expect(screen.getByRole('radio', { name: 'C' })).toHaveFocus()

      await user.keyboard('{ArrowUp}')
      expect(screen.getByRole('radio', { name: 'B' })).toBeChecked()
    })

    it('jumps to the first and last with Home and End, and ignores other keys', async () => {
      const user = userEvent.setup()
      render(<Group start="b" />)
      screen.getByRole('radio', { name: 'B' }).focus()

      await user.keyboard('{End}')
      expect(screen.getByRole('radio', { name: 'C' })).toBeChecked()
      await user.keyboard('{Home}')
      expect(screen.getByRole('radio', { name: 'A' })).toBeChecked()
      await user.keyboard('x')
      expect(screen.getByRole('radio', { name: 'A' })).toBeChecked()
    })

    it('leaves a key alone when Alt, Ctrl or Cmd is held, so browser shortcuts still work', () => {
      render(<Group start="b" />)
      const middle = screen.getByRole('radio', { name: 'B' })
      middle.focus()

      for (const modifier of ['altKey', 'ctrlKey', 'metaKey'] as const) {
        const notPrevented = fireEvent.keyDown(middle, { key: 'ArrowLeft', [modifier]: true })
        expect(notPrevented).toBe(true)
        expect(middle).toBeChecked()
      }
    })

    it('does not move while disabled', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<SegmentedControl options={three} value="a" onChange={onChange} ariaLabel="Test" disabled />)
      const group = screen.getByRole('radiogroup')

      fireEvent.keyDown(group, { key: 'ArrowRight' })
      await user.keyboard('{ArrowRight}')

      expect(onChange).not.toHaveBeenCalled()
    })
  })

  it('does not fire onChange while disabled', () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl
        options={options}
        value="a"
        onChange={onChange}
        ariaLabel="Test"
        disabled
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'B' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
