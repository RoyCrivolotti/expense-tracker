import { act, render } from '@testing-library/react'
import { useEffect, useLayoutEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { TabId } from './nav/navItems'
import { useTabNavigation } from './useTabNavigation'

const TABS: TabId[] = ['dashboard', 'transactions', 'analytics', 'goals', 'settings']

/** The window's one scroll offset, which every tab shares. */
let y = 0
let frames: FrameRequestCallback[] = []
let scrollTo: MockInstance<typeof window.scrollTo>

beforeEach(() => {
  y = 0
  frames = []
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => y)
  scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(((options: ScrollToOptions) => {
    y = options.top ?? 0
  }) as typeof window.scrollTo)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Run the frames the last move asked for, as the browser does once React has rendered. */
function flushFrames() {
  const due = frames
  frames = []
  due.forEach((cb) => cb(0))
}

/** How a tab may scroll itself into place as it opens: straight away as it mounts, or a frame later, as `scrollToAnchor` does. */
type OwnScroll = { at: number; when: 'mount' | 'frame' }

function FakeTab({ own }: { own: OwnScroll | undefined }) {
  useEffect(() => {
    if (!own) return
    if (own.when === 'mount') y = own.at
    else requestAnimationFrame(() => (y = own.at))
  }, [own])
  return null
}

type Nav = ReturnType<typeof useTabNavigation>

function setup(
  own: Partial<Record<TabId, OwnScroll>> = {},
  guardLeave: (go: () => void) => void = (go) => go(),
) {
  const box: { nav: Nav | null } = { nav: null }
  function Harness() {
    const nav = useTabNavigation(guardLeave, () => {})
    // Read by the test after each act, which has run this effect by then.
    useLayoutEffect(() => {
      box.nav = nav
    })
    return <FakeTab key={nav.tab} own={own[nav.tab]} />
  }
  render(<Harness />)
  const nav = () => box.nav!
  const press = (tab: TabId) => {
    act(() => nav().selectTab(tab))
    flushFrames()
  }
  return { nav, press }
}

/** A small deterministic generator, so each walk is the same on every run. */
function walk(
  seed: number,
  steps: number,
) {
  let state = seed
  const next = () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
    return state
  }
  return Array.from({ length: steps }, () => ({ tab: TABS[next() % TABS.length]!, offset: next() % 6000 }))
}

describe('useTabNavigation scroll', () => {
  it.each([1, 7, 42, 2026])('opens every tab at the top, in any order and from any offset (walk %i)', (seed) => {
    const { nav, press } = setup()
    for (const { tab, offset } of walk(seed, 40)) {
      if (tab === nav().tab) continue
      y = offset
      press(tab)
      expect(nav().tab).toBe(tab)
      expect(y).toBe(0)
    }
  })

  it('puts the reported case right: Dashboard comes back at the top after Transactions is scrolled', () => {
    const { press } = setup()
    press('transactions')
    y = 2500
    press('dashboard')
    expect(y).toBe(0)
  })

  it('opens a tab again at the top, not where it was left', () => {
    const { press } = setup()
    press('transactions')
    y = 1800
    press('goals')
    y = 300
    press('transactions')
    expect(y).toBe(0)
  })

  it.each([
    [false, 'smooth'],
    [true, 'auto'],
  ])('pressing the tab already open goes to its top (reduced motion %s: %s)', (reduce, behavior) => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('prefers-reduced-motion') }))
    const { nav, press } = setup()
    press('transactions')
    y = 1800

    press('transactions')

    expect(nav().tab).toBe('transactions')
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior })
  })

  it.each<[string, (nav: Nav) => void, TabId]>([
    ['the check-in nudge', (nav) => nav.logCheckin(), 'goals'],
    ['a drill-down', (nav) => nav.openTransactions({ month: '2026-10' }), 'transactions'],
    ['a pointer to a section of Settings', (nav) => nav.openImport(), 'settings'],
  ])('opens the tab %s sends you to at the top', (_name, send, tab) => {
    const { nav } = setup()
    y = 2200

    act(() => send(nav()))
    flushFrames()

    expect(nav().tab).toBe(tab)
    expect(y).toBe(0)
  })

  it.each<[TabId, (nav: Nav) => void, OwnScroll]>([
    ['goals', (nav) => nav.logCheckin(), { at: 640, when: 'mount' }],
    ['goals', (nav) => nav.logCheckin(), { at: 910, when: 'frame' }],
    ['settings', (nav) => nav.openImport(), { at: 420, when: 'mount' }],
    ['transactions', (nav) => nav.openTransactions({ query: 'shop' }), { at: 1300, when: 'frame' }],
  ])('lets %s scroll itself into place as it opens for something', (tab, send, own) => {
    const { nav } = setup({ [tab]: own })
    y = 1100

    act(() => send(nav()))
    flushFrames()

    expect(y).toBe(own.at)
  })

  it('does not scroll when something asks for the tab already open', () => {
    const { nav, press } = setup()
    press('goals')
    y = 750
    scrollTo.mockClear()

    act(() => nav().logCheckin())
    flushFrames()

    expect(scrollTo).not.toHaveBeenCalled()
    expect(y).toBe(750)
  })

  it('waits for the leave question before moving the page, so Stay leaves the tab where it was', () => {
    // Goals holds unsaved edits once the user is on it, so leaving it waits for an answer.
    let unsaved = false
    let held: (() => void) | null = null
    const { nav, press } = setup({}, (go) => (unsaved ? (held = go) : go()))
    press('goals')
    unsaved = true
    y = 700
    scrollTo.mockClear()

    press('analytics')

    expect(held).not.toBeNull()
    expect(scrollTo).not.toHaveBeenCalled()
    expect(nav().tab).toBe('goals')
    expect(y).toBe(700)

    act(() => held!())
    flushFrames()

    expect(nav().tab).toBe('analytics')
    expect(y).toBe(0)
  })

  it('jumps to the top of another tab at once, with no smooth scroll after it', () => {
    const { press } = setup()
    press('transactions')
    y = 1800
    scrollTo.mockClear()

    press('analytics')

    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
  })
})
