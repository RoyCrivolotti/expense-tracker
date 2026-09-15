import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NativeDateOverlay } from './NativeDateOverlay'

/**
 * iOS Safari's date picker offers dates outside min/max regardless of the attributes,
 * so a change event carrying an out-of-range date is a real thing this component sees
 * on the platform most of this app is used from. The attributes alone are not the guard.
 */
function renderOverlay(max?: string, disabled?: boolean) {
  const onChange = vi.fn()
  render(
    <NativeDateOverlay
      type="date"
      value="2026-09-15"
      label="15 Sep 2026"
      ariaLabel="Date"
      max={max}
      disabled={disabled}
      onChange={onChange}
    />,
  )
  return { onChange, input: screen.getByLabelText('Date') }
}

describe('NativeDateOverlay range enforcement', () => {
  it('reports the cap rather than the out-of-range date the picker handed back', () => {
    const { onChange, input } = renderOverlay('2026-09-15')

    fireEvent.change(input, { target: { value: '2026-09-16' } })

    expect(onChange).toHaveBeenCalledWith('2026-09-15')
  })

  it('reports an in-range date unchanged', () => {
    const { onChange, input } = renderOverlay('2026-09-15')

    fireEvent.change(input, { target: { value: '2026-09-10' } })

    expect(onChange).toHaveBeenCalledWith('2026-09-10')
  })

  it('still sets the attributes, for the browsers that do honour them', () => {
    const { input } = renderOverlay('2026-09-15')

    expect(input).toHaveAttribute('max', '2026-09-15')
  })

  it('leaves everything through when no cap is given', () => {
    const { onChange, input } = renderOverlay()

    fireEvent.change(input, { target: { value: '2099-01-01' } })

    expect(onChange).toHaveBeenCalledWith('2099-01-01')
  })
})

describe('NativeDateOverlay disabled', () => {
  it('disables the real input, which is the thing the user touches', () => {
    // The visible label is inert (pointer-events: none) and sits under the input, so
    // anything short of disabling the input itself leaves the field fully tappable.
    const { input } = renderOverlay(undefined, true)

    expect(input).toBeDisabled()
  })

  it('stays enabled when not asked to disable', () => {
    expect(renderOverlay().input).toBeEnabled()
  })
})
