import { useRef } from 'react'
import { render, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useFocusTrap } from './useFocusTrap'

function TrapHarness({ hiddenFirst }: { hiddenFirst: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, vi.fn())
  return (
    <div ref={ref}>
      {/* A mounted-but-hidden sibling (e.g. the inactive Add one/Add multiple tab)
       * sits first in DOM order — initial focus and Tab-cycling must skip it. */}
      <div hidden={hiddenFirst}>
        <input aria-label="hidden field" />
      </div>
      <button type="button">visible button</button>
    </div>
  )
}

describe('useFocusTrap — hidden descendants', () => {
  it('sends initial focus to the first visible focusable, skipping a hidden sibling', () => {
    render(<TrapHarness hiddenFirst />)
    expect(document.activeElement).toHaveTextContent('visible button')
  })

  it('includes a sibling once it is no longer hidden', () => {
    const { rerender } = render(<TrapHarness hiddenFirst />)
    // Focus starts on "visible button" (the only focusable while the sibling is
    // hidden). Un-hide the sibling, then Tab forward from the last (only) item —
    // the trap wraps around to `focusables[0]`, which is now that sibling instead
    // of the button, proving it re-entered the scan once no longer hidden.
    rerender(<TrapHarness hiddenFirst={false} />)
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toHaveAttribute('aria-label', 'hidden field')
  })
})

function Pair({ trapped }: { trapped: boolean }) {
  return (
    <>
      <button type="button">trigger</button>
      <button type="button">elsewhere</button>
      {trapped ? <TrapHarness hiddenFirst={false} /> : null}
    </>
  )
}

describe('useFocusTrap — giving focus back', () => {
  it('returns focus to what had it before the trap opened', () => {
    const { rerender, getByText } = render(<Pair trapped={false} />)
    getByText('trigger').focus()

    rerender(<Pair trapped />)
    expect(document.activeElement).not.toBe(getByText('trigger'))

    rerender(<Pair trapped={false} />)
    expect(document.activeElement).toBe(getByText('trigger'))
  })

  it('leaves focus where it has gone since, when the trap is held past a hand-over', () => {
    // A sheet now stays mounted for a moment after it is closed. If something else took
    // focus in that moment, taking it back would drop a keyboard the person just raised.
    const { rerender, getByText } = render(<Pair trapped={false} />)
    getByText('trigger').focus()
    rerender(<Pair trapped />)

    getByText('elsewhere').focus()
    rerender(<Pair trapped={false} />)

    expect(document.activeElement).toBe(getByText('elsewhere'))
  })
})
