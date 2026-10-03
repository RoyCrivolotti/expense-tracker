import { fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { useDismissOnOutsidePointer } from './useDismissOnOutsidePointer'

function Host() {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(true)
  useDismissOnOutsidePointer(ref, open, () => setOpen(false))
  return (
    <div>
      <div ref={ref}>{open ? 'open' : 'closed'}</div>
      <p>outside</p>
    </div>
  )
}

const at = (x: number, y: number, pointerId = 1) => ({ clientX: x, clientY: y, pointerId })

describe('useDismissOnOutsidePointer', () => {
  it('dismisses on a tap outside', () => {
    render(<Host />)
    const outside = screen.getByText('outside')
    fireEvent.pointerDown(outside, at(10, 10))
    expect(screen.getByText('open')).toBeInTheDocument()
    fireEvent.pointerUp(outside, at(12, 11))
    expect(screen.getByText('closed')).toBeInTheDocument()
  })

  it('still dismisses when the host re-renders, with a new callback, between the finger landing and lifting', () => {
    // On a touch screen something re-rendered the owner of the scenario menu between the two, and
    // a hook that held the callback it was given when it attached never saw the tap finish.
    function Rerenders() {
      const ref = useRef<HTMLDivElement>(null)
      const [open, setOpen] = useState(true)
      const [, bump] = useState(0)
      useDismissOnOutsidePointer(ref, open, () => setOpen(false))
      return (
        <div>
          <div ref={ref}>{open ? 'open' : 'closed'}</div>
          <p onPointerDown={() => bump((n) => n + 1)}>outside</p>
        </div>
      )
    }
    render(<Rerenders />)
    const outside = screen.getByText('outside')
    fireEvent.pointerDown(outside, at(10, 10))
    fireEvent.pointerUp(outside, at(10, 10))
    expect(screen.getByText('closed')).toBeInTheDocument()
  })

  it('leaves it open when the pointer scrolls instead of tapping', () => {
    render(<Host />)
    const outside = screen.getByText('outside')
    // A finger that comes down to scroll the page and see the tooltip must not close it.
    fireEvent.pointerDown(outside, at(10, 10))
    fireEvent.pointerUp(outside, at(10, 80))
    expect(screen.getByText('open')).toBeInTheDocument()
  })

  it('ignores a pointer up that had no down outside, and a cancelled one', () => {
    render(<Host />)
    const inside = screen.getByText('open')
    const outside = screen.getByText('outside')
    fireEvent.pointerDown(inside, at(10, 10))
    fireEvent.pointerUp(outside, at(10, 10))
    expect(screen.getByText('open')).toBeInTheDocument()
    fireEvent.pointerDown(outside, at(10, 10))
    fireEvent.pointerCancel(outside, at(10, 10))
    fireEvent.pointerUp(outside, at(10, 10))
    expect(screen.getByText('open')).toBeInTheDocument()
  })
})
