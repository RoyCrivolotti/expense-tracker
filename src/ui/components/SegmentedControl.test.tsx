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
    render(
      <SegmentedControl options={options} value="a" onChange={onChange} ariaLabel="Test" />,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'B' }))
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('marks the active option checked', () => {
    render(
      <SegmentedControl options={options} value="b" onChange={vi.fn()} ariaLabel="Test" />,
    )
    expect(screen.getByRole('radio', { name: 'A' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'B' })).toHaveAttribute('aria-checked', 'true')
  })

  it('scrolls the active option into view for a scroll layout', () => {
    const scrollIntoView = vi.fn()
    HTMLButtonElement.prototype.scrollIntoView = scrollIntoView
    render(
      <SegmentedControl
        options={options}
        value="b"
        onChange={vi.fn()}
        ariaLabel="Test"
        layout="scroll"
      />,
    )
    expect(scrollIntoView).toHaveBeenCalledWith({ inline: 'center', block: 'nearest' })
  })

  it('does not scroll for the default compact layout', () => {
    const scrollIntoView = vi.fn()
    HTMLButtonElement.prototype.scrollIntoView = scrollIntoView
    render(<SegmentedControl options={options} value="b" onChange={vi.fn()} ariaLabel="Test" />)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('tolerates an environment without scrollIntoView', () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLButtonElement.prototype, 'scrollIntoView')
    // @ts-expect-error simulating a jsdom-like environment that lacks the API
    delete HTMLButtonElement.prototype.scrollIntoView
    expect(() =>
      render(
        <SegmentedControl
          options={options}
          value="b"
          onChange={vi.fn()}
          ariaLabel="Test"
          layout="scroll"
        />,
      ),
    ).not.toThrow()
    if (descriptor) Object.defineProperty(HTMLButtonElement.prototype, 'scrollIntoView', descriptor)
  })
})
