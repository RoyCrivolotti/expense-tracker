import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeDateOverlay } from './NativeDateOverlay'

describe('NativeDateOverlay', () => {
  afterEach(() => {
    // showPicker isn't implemented in jsdom — remove any per-test mock so it
    // doesn't leak into other test files sharing this same prototype.
    delete (HTMLInputElement.prototype as { showPicker?: () => void }).showPicker
  })

  it('opens the native picker when clicked anywhere in the field (desktop click-anywhere parity with mobile)', () => {
    const showPicker = vi.fn()
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', { value: showPicker, configurable: true })
    render(<NativeDateOverlay type="date" value="2026-07-05" label="5 Jul 2026" onChange={vi.fn()} />)

    fireEvent.click(screen.getByDisplayValue('2026-07-05'))

    expect(showPicker).toHaveBeenCalledTimes(1)
  })

  it('opens the picker on Space (keyboard parity) but leaves Enter alone (form submit)', () => {
    const showPicker = vi.fn()
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', { value: showPicker, configurable: true })
    render(<NativeDateOverlay type="date" value="2026-07-05" label="5 Jul 2026" onChange={vi.fn()} />)
    const input = screen.getByDisplayValue('2026-07-05')

    fireEvent.keyDown(input, { key: ' ' })
    expect(showPicker).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(showPicker).toHaveBeenCalledTimes(1)
  })

  it('does not throw when showPicker is unsupported (older Firefox)', () => {
    render(<NativeDateOverlay type="date" value="2026-07-05" label="5 Jul 2026" onChange={vi.fn()} />)
    expect(() => fireEvent.click(screen.getByDisplayValue('2026-07-05'))).not.toThrow()
  })

  it('does not throw when showPicker itself throws (no transient user activation)', () => {
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {
      value: () => {
        throw new DOMException('not allowed', 'NotAllowedError')
      },
      configurable: true,
    })
    render(<NativeDateOverlay type="date" value="2026-07-05" label="5 Jul 2026" onChange={vi.fn()} />)
    expect(() => fireEvent.click(screen.getByDisplayValue('2026-07-05'))).not.toThrow()
  })

  it('still calls onChange when the underlying value changes', () => {
    const onChange = vi.fn()
    render(<NativeDateOverlay type="date" value="2026-07-05" label="5 Jul 2026" onChange={onChange} />)
    fireEvent.change(screen.getByDisplayValue('2026-07-05'), { target: { value: '2026-09-10' } })
    expect(onChange).toHaveBeenCalledWith('2026-09-10')
  })
})
