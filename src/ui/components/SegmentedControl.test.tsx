import { fireEvent, render, screen } from '@testing-library/react'
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
