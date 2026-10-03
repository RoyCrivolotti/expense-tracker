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

    it('keeps the key press for the control when it moves the selection, and lets any other key through', () => {
      render(<Group start="b" />)
      const middle = screen.getByRole('radio', { name: 'B' })
      middle.focus()

      for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End']) {
        expect(fireEvent.keyDown(screen.getByRole('radio', { checked: true }), { key })).toBe(false)
        // Back on the middle one for the next key.
        fireEvent.click(middle)
      }
      for (const key of ['Tab', 'x', 'Enter', ' ']) {
        expect(fireEvent.keyDown(middle, { key })).toBe(true)
      }
    })

    it('does not report a selection that is not changing', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      const { rerender } = render(<SegmentedControl options={three} value="a" onChange={onChange} ariaLabel="Test" />)
      screen.getByRole('radio', { name: 'A' }).focus()

      await user.keyboard('{Home}')
      expect(onChange).not.toHaveBeenCalled()

      rerender(<SegmentedControl options={three} value="c" onChange={onChange} ariaLabel="Test" />)
      screen.getByRole('radio', { name: 'C' }).focus()
      await user.keyboard('{End}')
      expect(onChange).not.toHaveBeenCalled()

      rerender(<SegmentedControl options={three.slice(0, 1)} value="a" onChange={onChange} ariaLabel="Test" />)
      screen.getByRole('radio', { name: 'A' }).focus()
      await user.keyboard('{ArrowRight}{ArrowLeft}')
      expect(onChange).not.toHaveBeenCalled()
    })

    it('still reports a click on the option already selected', () => {
      const onChange = vi.fn()
      render(<SegmentedControl options={three} value="b" onChange={onChange} ariaLabel="Test" />)

      fireEvent.click(screen.getByRole('radio', { name: 'B' }))

      expect(onChange).toHaveBeenCalledWith('b')
    })

    it('steps from the option that has focus, which is not always the selected one', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<SegmentedControl options={three} value="a" onChange={onChange} ariaLabel="Test" />)
      screen.getByRole('radio', { name: 'C' }).focus()

      await user.keyboard('{ArrowLeft}')
      expect(onChange).toHaveBeenLastCalledWith('b')
      expect(screen.getByRole('radio', { name: 'B' })).toHaveFocus()

      await user.keyboard('{ArrowRight}')
      expect(onChange).toHaveBeenLastCalledWith('c')
      expect(screen.getByRole('radio', { name: 'C' })).toHaveFocus()
    })

    it('moves focus to the option a key lands on even when it is the selected one', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<SegmentedControl options={three} value="a" onChange={onChange} ariaLabel="Test" />)
      screen.getByRole('radio', { name: 'C' }).focus()

      await user.keyboard('{Home}')

      expect(onChange).not.toHaveBeenCalled()
      expect(screen.getByRole('radio', { name: 'A' })).toHaveFocus()
    })

    it('steps from the tab stop for a key that did not come from an option', () => {
      const onChange = vi.fn()
      render(<SegmentedControl options={three} value="b" onChange={onChange} ariaLabel="Test" />)

      fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' })

      expect(onChange).toHaveBeenCalledWith('c')
    })

    it('goes from the first option to the second when the value is none of them', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<SegmentedControl options={three} value="none" onChange={onChange} ariaLabel="Test" />)
      screen.getByRole('radio', { name: 'A' }).focus()

      await user.keyboard('{ArrowRight}')

      expect(onChange).toHaveBeenCalledWith('b')
      expect(screen.getByRole('radio', { name: 'B' })).toHaveFocus()
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

  describe('as tabs', () => {
    const three = [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
      { value: 'c', label: 'C' },
    ]
    const tabs = { idPrefix: 'view', panelId: 'panel' }

    function Group({ start }: { start: string }) {
      const [value, setValue] = useState(start)
      return <SegmentedControl options={three} value={value} onChange={setValue} ariaLabel="View" tabs={tabs} />
    }

    it('is a tab list whose tabs name themselves and the panel they control', () => {
      render(<Group start="b" />)

      expect(screen.getByRole('tablist', { name: 'View' })).toBeInTheDocument()
      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
      expect(screen.queryByRole('radio')).not.toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute('aria-selected', 'false')
      expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('aria-selected', 'true')
      for (const tab of screen.getAllByRole('tab')) {
        expect(tab).toHaveAttribute('aria-controls', 'panel')
        expect(tab).not.toHaveAttribute('aria-checked')
      }
      expect(screen.getByRole('tab', { name: 'C' })).toHaveAttribute('id', 'view-c')
    })

    it('keeps one tab stop and moves selection and focus with the arrows, Home and End', async () => {
      const user = userEvent.setup()
      render(<Group start="a" />)
      const tab = (name: string) => screen.getByRole('tab', { name })

      expect(tab('A')).toHaveAttribute('tabindex', '0')
      expect(tab('B')).toHaveAttribute('tabindex', '-1')
      tab('A').focus()

      await user.keyboard('{ArrowRight}')
      expect(tab('B')).toHaveAttribute('aria-selected', 'true')
      expect(tab('B')).toHaveFocus()

      await user.keyboard('{End}')
      expect(tab('C')).toHaveFocus()
      await user.keyboard('{ArrowRight}')
      expect(tab('A')).toHaveFocus()
      await user.keyboard('{ArrowLeft}')
      expect(tab('C')).toHaveFocus()
      await user.keyboard('{Home}')
      expect(tab('A')).toHaveAttribute('aria-selected', 'true')
    })

    it('leaves ArrowUp and ArrowDown to the page, so scrolling does not swap the section', async () => {
      const user = userEvent.setup()
      render(<Group start="b" />)
      const middle = screen.getByRole('tab', { name: 'B' })
      middle.focus()

      for (const key of ['ArrowDown', 'ArrowUp']) {
        expect(fireEvent.keyDown(middle, { key })).toBe(true)
      }
      await user.keyboard('{ArrowDown}{ArrowUp}')

      expect(middle).toHaveAttribute('aria-selected', 'true')
      expect(middle).toHaveFocus()
    })

    it('keeps the key press for the tab list when Left, Right, Home or End moves the selection', () => {
      render(<Group start="b" />)
      const middle = screen.getByRole('tab', { name: 'B' })
      middle.focus()

      for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
        expect(fireEvent.keyDown(screen.getByRole('tab', { selected: true }), { key })).toBe(false)
        // Back on the middle one for the next key.
        fireEvent.click(middle)
      }
    })

    it('leaves a key alone when Alt, Ctrl or Cmd is held', () => {
      render(<Group start="b" />)
      const middle = screen.getByRole('tab', { name: 'B' })
      middle.focus()

      for (const modifier of ['altKey', 'ctrlKey', 'metaKey'] as const) {
        expect(fireEvent.keyDown(middle, { key: 'ArrowLeft', [modifier]: true })).toBe(true)
        expect(middle).toHaveAttribute('aria-selected', 'true')
      }
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
