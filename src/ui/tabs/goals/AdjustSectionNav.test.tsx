import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdjustSectionNav } from './AdjustSectionNav'
import { ADJUST_SECTIONS, adjustSectionId, type AdjustSection } from './adjustSections'
import { ADJUST_STACK_ID } from './scrollToAdjustSection'
import { NARROW_MQ } from './useGoalsNarrow'

/** Where each section's top is, in viewport pixels; the tests move these to "scroll". */
let tops: Record<string, number>

function placeSections(next: Record<string, number>) {
  tops = next
}

function setViewport(narrow: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: narrow && query === NARROW_MQ,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

function scrollPage() {
  act(() => {
    window.dispatchEvent(new Event('scroll'))
  })
}

beforeEach(() => {
  for (const s of ADJUST_SECTIONS) {
    const el = document.createElement('details')
    el.id = adjustSectionId(s.key)
    document.body.append(el)
  }
  placeSections({ portfolio: 300, housing: 600, fire: 1200, tracking: 1600, events: 1700 })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const top = tops[this.id.replace('goals-adjust-', '')] ?? 0
    return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) }
  })
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
  // jsdom reports no page height, which reads as always being at the bottom.
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 5000 })
  setViewport(true)
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document.documentElement, 'scrollHeight')
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
})

const current = () => screen.getByRole('button', { current: true }).textContent

function sectionElement(key: AdjustSection): HTMLDetailsElement {
  const el = document.getElementById(adjustSectionId(key))
  if (!(el instanceof HTMLDetailsElement)) throw new Error(`no ${key} section`)
  return el
}

describe('AdjustSectionNav', () => {
  it('offers a chip per section on a phone, and nothing on a wide screen', () => {
    const { unmount } = render(<AdjustSectionNav />)
    expect(
      screen.getAllByRole('button').map((b) => b.textContent),
    ).toEqual(ADJUST_SECTIONS.map((s) => s.chip))
    unmount()

    setViewport(false)
    render(<AdjustSectionNav />)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('marks the chip of the section being read as the page scrolls', () => {
    render(<AdjustSectionNav />)
    expect(current()).toBe('Portfolio')

    placeSections({ portfolio: -500, housing: -100, fire: 500, tracking: 900, events: 1000 })
    scrollPage()
    expect(current()).toBe('Housing')

    placeSections({ portfolio: -900, housing: -500, fire: -50, tracking: 300, events: 400 })
    scrollPage()
    expect(current()).toBe('FIRE')
  })

  describe('at the bottom of the page', () => {
    // FIRE has reached the top and the last two sections have not, as on a short phone.
    beforeEach(() => {
      placeSections({ portfolio: -900, housing: -500, fire: -50, tracking: 300, events: 400 })
      Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 100 })
    })

    it('marks the last chip when its controls are shown, since its section never reaches the top', () => {
      sectionElement('events').open = true
      render(<AdjustSectionNav />)

      expect(current()).toBe('Events')
    })

    it('keeps the section being read marked while the last one is folded to a row', () => {
      render(<AdjustSectionNav />)

      expect(current()).toBe('FIRE')
    })

    it('marks the last section with its controls shown, when the ones after it are folded', () => {
      // A tall phone: the end of the page is FIRE's controls and two folded rows, and FIRE's
      // heading never gets up to the line.
      placeSections({ portfolio: -700, housing: -300, fire: 400, tracking: 700, events: 750 })
      sectionElement('fire').open = true
      render(<AdjustSectionNav />)
      expect(current()).toBe('FIRE')

      sectionElement('tracking').open = true
      scrollPage()
      expect(current()).toBe('Tracking')
    })

    it('moves to the last chip once its controls are opened', () => {
      render(<AdjustSectionNav />)
      expect(current()).toBe('FIRE')

      sectionElement('events').open = true
      scrollPage()

      expect(current()).toBe('Events')
    })
  })

  it('scrolls to a tapped section and keeps its chip marked until the viewer scrolls themselves', async () => {
    const user = userEvent.setup()
    render(<AdjustSectionNav />)

    await user.click(screen.getByRole('button', { name: 'Events' }))
    expect(window.scrollBy).toHaveBeenCalledTimes(1)
    expect(current()).toBe('Events')

    // The jump's own scrolling, and a section that cannot reach the top, must not move it.
    placeSections({ portfolio: -900, housing: -500, fire: -50, tracking: 300, events: 400 })
    scrollPage()
    expect(current()).toBe('Events')

    fireEvent.touchStart(window)
    scrollPage()
    expect(current()).toBe('FIRE')
  })

  it('lets go of a tapped chip when the viewer presses the page, as a scrollbar drag does', async () => {
    const user = userEvent.setup()
    render(<AdjustSectionNav />)
    await user.click(screen.getByRole('button', { name: 'Events' }))
    placeSections({ portfolio: -900, housing: -500, fire: -50, tracking: 300, events: 400 })

    fireEvent.pointerDown(window)
    scrollPage()

    expect(current()).toBe('FIRE')
  })

  it('keeps the marked chip in sight inside the sideways-scrolling strip', async () => {
    const scrollTo = vi.fn()
    HTMLElement.prototype.scrollTo = scrollTo
    const user = userEvent.setup()
    render(<AdjustSectionNav />)
    scrollTo.mockClear()

    await user.click(screen.getByRole('button', { name: 'Tracking' }))

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
  })

  it('offers Save and Discard beside the chips only when there are unsaved changes, and runs them', async () => {
    const user = userEvent.setup()
    const unsaved = { onSave: vi.fn(), onDiscard: vi.fn() }
    const { rerender } = render(<AdjustSectionNav />)
    expect(screen.queryByRole('group', { name: 'Unsaved changes' })).not.toBeInTheDocument()

    rerender(<AdjustSectionNav unsaved={unsaved} />)
    const group = screen.getByRole('group', { name: 'Unsaved changes' })
    await user.click(within(group).getByRole('button', { name: 'Save' }))
    await user.click(within(group).getByRole('button', { name: 'Discard' }))

    expect(unsaved.onSave).toHaveBeenCalledTimes(1)
    expect(unsaved.onDiscard).toHaveBeenCalledTimes(1)
    // The chips are still all there to jump with.
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      ...ADJUST_SECTIONS.map((s) => s.chip),
      'Discard',
      'Save',
    ])
  })

  it('keeps a field that takes focus clear of the pinned block, but not a button', async () => {
    const stack = document.createElement('div')
    stack.id = ADJUST_STACK_ID
    document.body.append(stack)
    const field = document.createElement('input')
    document.body.append(field)
    // The block spans 0 to 300 and the field starts at 100, behind it. Set on the elements
    // themselves, since the prototype's rect is already mocked for the sections.
    stack.getBoundingClientRect = () => ({ top: 0, bottom: 300 }) as DOMRect
    field.getBoundingClientRect = () => ({ top: 100 }) as DOMRect
    render(<AdjustSectionNav />, { container: stack })

    fireEvent.focusIn(screen.getByRole('button', { name: 'FIRE' }))
    expect(window.scrollBy).not.toHaveBeenCalled()

    fireEvent.focusIn(field)
    await vi.waitFor(() => expect(window.scrollBy).toHaveBeenCalledWith({ top: 100 - 300 - 8, behavior: 'auto' }))
  })

  it('stops listening when it leaves the page', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<AdjustSectionNav />)

    unmount()

    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function))
    expect(remove).toHaveBeenCalledWith('touchstart', expect.any(Function))
  })
})
