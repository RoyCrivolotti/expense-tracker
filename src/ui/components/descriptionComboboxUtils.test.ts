import { describe, expect, it, vi } from 'vitest'
import type { KeyboardEvent } from 'react'
import type { DescriptionSuggestion } from '../../data/descriptionIndex'
import { handleComboboxKeyDown, moveHighlight, scheduleBlurDismiss } from './descriptionComboboxUtils'

function suggestion(label: string): DescriptionSuggestion {
  return { label, template: { type: 'expense', categoryId: 1, accountId: 1 } }
}

/** The handler only ever reads `key` and calls `preventDefault`, so a plain object is enough. */
function keyEvent(key: string) {
  return { key, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLInputElement> & {
    preventDefault: ReturnType<typeof vi.fn>
  }
}

function opts(overrides: Partial<Parameters<typeof handleComboboxKeyDown>[1]> = {}) {
  return {
    open: true,
    suggestions: [suggestion('Mercadona'), suggestion('Metro')],
    highlight: -1,
    setHighlight: vi.fn(),
    setFocused: vi.fn(),
    accept: vi.fn(),
    ...overrides,
  }
}

describe('moveHighlight', () => {
  it('returns -1 when there is nothing to highlight', () => {
    expect(moveHighlight(0, 1, 0)).toBe(-1)
  })

  it('starts at the first option from the unhighlighted state, whichever direction', () => {
    expect(moveHighlight(-1, 1, 3)).toBe(0)
    expect(moveHighlight(-1, -1, 3)).toBe(0)
  })

  it('wraps in both directions', () => {
    expect(moveHighlight(2, 1, 3)).toBe(0)
    expect(moveHighlight(0, -1, 3)).toBe(2)
    expect(moveHighlight(1, 1, 3)).toBe(2)
  })
})

describe('handleComboboxKeyDown — closed list', () => {
  it('unfocuses on Escape without preventing default', () => {
    const o = opts({ open: false })
    const e = keyEvent('Escape')
    handleComboboxKeyDown(e, o)
    expect(o.setFocused).toHaveBeenCalledWith(false)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('ignores arrow keys', () => {
    const o = opts({ open: false })
    handleComboboxKeyDown(keyEvent('ArrowDown'), o)
    expect(o.setHighlight).not.toHaveBeenCalled()
  })
})

describe('handleComboboxKeyDown — open list', () => {
  it('moves the highlight on ArrowDown and ArrowUp, preventing the caret from moving', () => {
    const down = opts()
    const e = keyEvent('ArrowDown')
    handleComboboxKeyDown(e, down)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(down.setHighlight).toHaveBeenCalled()

    const up = opts()
    handleComboboxKeyDown(keyEvent('ArrowUp'), up)
    expect(up.setHighlight).toHaveBeenCalled()
  })

  it('accepts the highlighted suggestion on Enter', () => {
    const o = opts({ highlight: 1 })
    const e = keyEvent('Enter')
    handleComboboxKeyDown(e, o)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(o.accept).toHaveBeenCalledWith(expect.objectContaining({ label: 'Metro' }))
  })

  it('does nothing on Enter when no suggestion is highlighted', () => {
    const o = opts({ highlight: -1 })
    const e = keyEvent('Enter')
    handleComboboxKeyDown(e, o)
    expect(o.accept).not.toHaveBeenCalled()
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('dismisses on Escape and clears the highlight', () => {
    const o = opts({ highlight: 1 })
    const e = keyEvent('Escape')
    handleComboboxKeyDown(e, o)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(o.setFocused).toHaveBeenCalledWith(false)
    expect(o.setHighlight).toHaveBeenCalledWith(-1)
  })
})

describe('handleComboboxKeyDown — onEnter (quick-entry callers)', () => {
  it('does NOT commit when a suggestion is highlighted — Enter accepts it and stops there', () => {
    const onEnter = vi.fn()
    const o = opts({ highlight: 1, onEnter })
    handleComboboxKeyDown(keyEvent('Enter'), o)
    expect(o.accept).toHaveBeenCalledWith(expect.objectContaining({ label: 'Metro' }))
    expect(onEnter).not.toHaveBeenCalled()
  })

  it('commits on Enter when the list is open but nothing is highlighted', () => {
    const onEnter = vi.fn()
    const o = opts({ highlight: -1, onEnter })
    const e = keyEvent('Enter')
    handleComboboxKeyDown(e, o)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(o.setFocused).toHaveBeenCalledWith(false)
    expect(onEnter).toHaveBeenCalledTimes(1)
    expect(o.accept).not.toHaveBeenCalled()
  })

  it('commits on Enter when the list is closed', () => {
    const onEnter = vi.fn()
    const o = opts({ open: false, onEnter })
    handleComboboxKeyDown(keyEvent('Enter'), o)
    expect(onEnter).toHaveBeenCalledTimes(1)
  })

  it('leaves Escape and the arrows untouched', () => {
    const onEnter = vi.fn()
    const o = opts({ onEnter })
    handleComboboxKeyDown(keyEvent('ArrowDown'), o)
    handleComboboxKeyDown(keyEvent('Escape'), o)
    expect(onEnter).not.toHaveBeenCalled()
    expect(o.setHighlight).toHaveBeenCalled()
  })
})

describe('scheduleBlurDismiss', () => {
  it('dismisses once focus has left the combobox root', () => {
    vi.useFakeTimers()
    const dismiss = vi.fn()
    scheduleBlurDismiss({ current: { contains: () => false } as unknown as HTMLDivElement }, dismiss)
    vi.advanceTimersByTime(200)
    expect(dismiss).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('leaves the list alone when focus is still inside the root', () => {
    vi.useFakeTimers()
    const dismiss = vi.fn()
    scheduleBlurDismiss({ current: { contains: () => true } as unknown as HTMLDivElement }, dismiss)
    vi.advanceTimersByTime(200)
    expect(dismiss).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
