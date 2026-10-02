import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdjustSectionNav } from './AdjustSectionNav'
import { ADJUST_SECTIONS, adjustSectionId, type AdjustSection } from './adjustSections'
import { ADJUST_STACK_ID } from './goalsAnchors'
import { NARROW_MQ } from './useGoalsNarrow'
import styles from './goals.module.css'

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

  // A touch, the wheel, a key (PageUp after tapping Events) or a press on the page, which is all
  // a scrollbar drag sends, each hands the scrolling back to the viewer.
  it.each(['touchstart', 'pointerdown', 'wheel', 'keydown'])(
    'lets go of a tapped chip at the viewer\'s %s, so the mark follows the page again',
    async (type) => {
      const user = userEvent.setup()
      render(<AdjustSectionNav />)
      await user.click(screen.getByRole('button', { name: 'Events' }))
      placeSections({ portfolio: -900, housing: -500, fire: -50, tracking: 300, events: 400 })
      scrollPage()
      expect(current()).toBe('Events')

      act(() => {
        window.dispatchEvent(new Event(type))
      })
      scrollPage()

      expect(current()).toBe('FIRE')
    },
  )

  it('marks the chip of the section being read with the mark that can be seen, and no other', () => {
    render(<AdjustSectionNav />)

    expect(screen.getByRole('button', { name: 'Portfolio' })).toHaveClass(styles.chipActive!)
    for (const other of ['Housing', 'FIRE', 'Tracking', 'Events']) {
      expect(screen.getByRole('button', { name: other })).not.toHaveClass(styles.chipActive!)
    }

    placeSections({ portfolio: -500, housing: -100, fire: 500, tracking: 900, events: 1000 })
    scrollPage()

    expect(screen.getByRole('button', { name: 'Housing' })).toHaveClass(styles.chipActive!)
    expect(screen.getByRole('button', { name: 'Portfolio' })).not.toHaveClass(styles.chipActive!)
  })

  describe('where a section starts to count as the one being read', () => {
    // 12px under the bottom of what is pinned; with nothing pinned in jsdom, 12px down the screen.
    it('counts a section whose top is on that line, and not one a pixel under it', () => {
      render(<AdjustSectionNav />)

      placeSections({ portfolio: -300, housing: 12, fire: 500, tracking: 900, events: 1000 })
      scrollPage()
      expect(current()).toBe('Housing')

      placeSections({ portfolio: -300, housing: 13, fire: 500, tracking: 900, events: 1000 })
      scrollPage()
      expect(current()).toBe('Portfolio')
    })

    it('puts the line under the pinned stack, wherever that is', () => {
      const stack = document.createElement('div')
      stack.id = ADJUST_STACK_ID
      stack.style.position = 'sticky'
      stack.style.top = '100px'
      Object.defineProperty(stack, 'offsetHeight', { configurable: true, value: 164 })
      document.body.append(stack)
      render(<AdjustSectionNav />)

      placeSections({ portfolio: -300, housing: 276, fire: 500, tracking: 900, events: 1000 })
      scrollPage()
      expect(current()).toBe('Housing')

      placeSections({ portfolio: -300, housing: 277, fire: 500, tracking: 900, events: 1000 })
      scrollPage()
      expect(current()).toBe('Portfolio')
    })
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

  it('re-centres the marked chip when the actions appear and narrow the strip', () => {
    const scrollTo = vi.fn()
    HTMLElement.prototype.scrollTo = scrollTo
    // jsdom has no layout: the strip is 300px wide until the actions sit beside it, then 100px.
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(() =>
      document.querySelector('[aria-label="Unsaved changes"]') ? 100 : 300,
    )
    const { rerender } = render(<AdjustSectionNav />)
    expect(scrollTo).toHaveBeenLastCalledWith({ left: -150, behavior: 'smooth' })

    rerender(<AdjustSectionNav unsaved={{ name: 'Path A', saving: false, onSave: vi.fn(), onDiscard: vi.fn() }} />)

    expect(scrollTo).toHaveBeenLastCalledWith({ left: -50, behavior: 'smooth' })
  })

  it('moves the marked chip into sight without animation when the viewer asked for reduced motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === NARROW_MQ || query === '(prefers-reduced-motion: reduce)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    const scrollTo = vi.fn()
    HTMLElement.prototype.scrollTo = scrollTo
    const user = userEvent.setup()
    render(<AdjustSectionNav />)
    scrollTo.mockClear()

    await user.click(screen.getByRole('button', { name: 'Tracking' }))

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }))
  })

  it('offers Save and Discard beside the chips only when there are unsaved changes, and runs them', async () => {
    const user = userEvent.setup()
    const unsaved = { name: 'Path A', saving: false, onSave: vi.fn(), onDiscard: vi.fn() }
    const { rerender } = render(<AdjustSectionNav />)
    expect(screen.queryByRole('group', { name: 'Unsaved changes' })).not.toBeInTheDocument()

    rerender(<AdjustSectionNav unsaved={unsaved} />)
    const group = screen.getByRole('group', { name: 'Unsaved changes' })
    await user.click(within(group).getByRole('button', { name: 'Save changes to Path A' }))
    await user.click(within(group).getByRole('button', { name: 'Discard changes' }))

    expect(unsaved.onSave).toHaveBeenCalledTimes(1)
    expect(unsaved.onDiscard).toHaveBeenCalledTimes(1)
    // The chips are still all there to jump with.
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      ...ADJUST_SECTIONS.map((s) => s.chip),
      'Discard',
      'Save',
    ])
  })

  it('takes neither Save nor Discard while a save is in flight', () => {
    const unsaved = { name: 'Path A', saving: false, onSave: vi.fn(), onDiscard: vi.fn() }
    const { rerender } = render(<AdjustSectionNav unsaved={unsaved} />)
    const group = screen.getByRole('group', { name: 'Unsaved changes' })
    const buttons = () => within(group).getAllByRole('button')
    for (const button of buttons()) expect(button).toBeEnabled()

    rerender(<AdjustSectionNav unsaved={{ ...unsaved, saving: true }} />)

    for (const button of buttons()) expect(button).toBeDisabled()
  })

  describe('when Save and Discard go', () => {
    const unsaved = { name: 'Path A', saving: false, onSave: vi.fn(), onDiscard: vi.fn() }
    const markedChip = () => screen.getByRole('button', { current: true })

    it('moves focus to the marked chip if it was on one of them, rather than dropping it to the page', () => {
      const { rerender } = render(<AdjustSectionNav unsaved={unsaved} />)
      screen.getByRole('button', { name: 'Discard changes' }).focus()

      rerender(<AdjustSectionNav />)

      expect(markedChip()).toHaveFocus()
    })

    it('does the same when the viewer pressed Save, which disabled it and so blurred it', () => {
      const { rerender } = render(<AdjustSectionNav unsaved={unsaved} />)
      const save = screen.getByRole('button', { name: 'Save changes to Path A' })
      save.focus()

      rerender(<AdjustSectionNav unsaved={{ ...unsaved, saving: true }} />)
      // A browser blurs a focused button that becomes disabled and leaves focus on the page.
      const active = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body)
      fireEvent.focusOut(save)
      rerender(<AdjustSectionNav />)
      active.mockRestore()

      expect(markedChip()).toHaveFocus()
    })

    it('hands focus back to the button when the write fails and the buttons come back', () => {
      const { rerender } = render(<AdjustSectionNav unsaved={unsaved} />)
      const save = screen.getByRole('button', { name: 'Save changes to Path A' })
      save.focus()
      const focus = vi.spyOn(save, 'focus')

      rerender(<AdjustSectionNav unsaved={{ ...unsaved, saving: true }} />)
      // A browser blurs a focused button that becomes disabled and leaves focus on the page.
      const active = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body)
      fireEvent.focusOut(save)
      expect(focus).not.toHaveBeenCalled()
      rerender(<AdjustSectionNav unsaved={unsaved} />)
      active.mockRestore()

      expect(focus).toHaveBeenCalledTimes(1)
    })

    it('leaves focus where the viewer put it when it was not on them', () => {
      const { rerender } = render(<AdjustSectionNav unsaved={unsaved} />)
      const field = document.createElement('input')
      document.body.append(field)
      field.focus()

      rerender(<AdjustSectionNav />)

      expect(field).toHaveFocus()
    })

    it('does not pull focus back once the viewer has moved on from them', () => {
      const { rerender } = render(<AdjustSectionNav unsaved={unsaved} />)
      screen.getByRole('button', { name: 'Discard changes' }).focus()
      screen.getByRole('button', { name: 'Discard changes' }).blur()

      rerender(<AdjustSectionNav />)

      expect(document.body).toHaveFocus()
    })
  })

  it('keeps a field that takes focus clear of the pinned block, but not a button', async () => {
    const stack = document.createElement('div')
    stack.id = ADJUST_STACK_ID
    stack.style.position = 'sticky'
    document.body.append(stack)
    const field = document.createElement('input')
    sectionElement('housing').append(field)
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

  it('leaves a field outside the Adjust controls alone, as one in a dialog', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
    const stack = document.createElement('div')
    stack.id = ADJUST_STACK_ID
    stack.style.position = 'sticky'
    document.body.append(stack)
    stack.getBoundingClientRect = () => ({ top: 0, bottom: 300 }) as DOMRect
    const dialogField = document.createElement('input')
    dialogField.getBoundingClientRect = () => ({ top: 100 }) as DOMRect
    document.body.append(dialogField)
    const controlField = document.createElement('input')
    controlField.getBoundingClientRect = () => ({ top: 100 }) as DOMRect
    sectionElement('tracking').append(controlField)
    render(<AdjustSectionNav />, { container: stack })

    fireEvent.focusIn(dialogField)
    expect(window.scrollBy).not.toHaveBeenCalled()

    fireEvent.focusIn(controlField)
    expect(window.scrollBy).toHaveBeenCalledWith({ top: 100 - 300 - 8, behavior: 'auto' })
  })

  it('stops listening to the page when it leaves it, taking away each listener it put up', () => {
    const windowTypes = ['scroll', 'resize', 'touchstart', 'wheel', 'keydown', 'pointerdown']
    const added = vi.spyOn(window, 'addEventListener')
    const addedToDocument = vi.spyOn(document, 'addEventListener')
    const removed = vi.spyOn(window, 'removeEventListener')
    const removedFromDocument = vi.spyOn(document, 'removeEventListener')
    const { unmount } = render(<AdjustSectionNav />)
    const mine = (calls: unknown[][], types: string[]) => calls.filter(([type]) => types.includes(type as string))
    const putUp = mine(added.mock.calls, windowTypes)
    const putUpOnDocument = mine(addedToDocument.mock.calls, ['focusin'])
    // Each type once, so a listener that is never put away cannot hide among the others.
    expect(putUp.map(([type]) => type).sort()).toEqual([...windowTypes].sort())
    expect(putUpOnDocument).toHaveLength(1)

    unmount()

    for (const [type, listener] of putUp) expect(removed, String(type)).toHaveBeenCalledWith(type, listener)
    for (const [type, listener] of putUpOnDocument) {
      expect(removedFromDocument, String(type)).toHaveBeenCalledWith(type, listener)
    }
  })
})
