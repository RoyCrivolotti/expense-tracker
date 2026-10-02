import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdjustSectionNav } from './AdjustSectionNav'
import { ADJUST_SECTIONS, adjustSectionId } from './adjustSections'
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

  it('marks the last chip at the bottom of the page, where its section never reaches the top', () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 100 })
    render(<AdjustSectionNav />)

    expect(current()).toBe('Events')
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

  it('keeps the marked chip in sight inside the sideways-scrolling strip', async () => {
    const scrollTo = vi.fn()
    HTMLElement.prototype.scrollTo = scrollTo
    const user = userEvent.setup()
    render(<AdjustSectionNav />)
    scrollTo.mockClear()

    await user.click(screen.getByRole('button', { name: 'Tracking' }))

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
  })

  it('stops listening when it leaves the page', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<AdjustSectionNav />)

    unmount()

    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function))
    expect(remove).toHaveBeenCalledWith('touchstart', expect.any(Function))
  })
})
