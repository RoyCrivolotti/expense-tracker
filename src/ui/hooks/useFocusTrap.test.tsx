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

describe('useFocusTrap — Escape', () => {
  function EscapeHarness({ onEscape }: { onEscape: () => void }) {
    const ref = useRef<HTMLDivElement>(null)
    useFocusTrap(ref, onEscape)
    return (
      <div ref={ref}>
        <button type="button">inside</button>
      </div>
    )
  }

  it('closes, and marks the key as used for whatever sits behind the dialog', () => {
    const onEscape = vi.fn()
    render(<EscapeHarness onEscape={onEscape} />)
    let seenBehind: boolean | undefined
    const behind = (e: KeyboardEvent) => {
      seenBehind = e.defaultPrevented
    }
    window.addEventListener('keydown', behind)
    try {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    } finally {
      window.removeEventListener('keydown', behind)
    }
    expect(onEscape).toHaveBeenCalledTimes(1)
    expect(seenBehind).toBe(true)
  })
})
