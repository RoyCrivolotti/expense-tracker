import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SectionTabs } from './SectionTabs'

type Section = 'one' | 'two' | 'three'

const OPTIONS: { value: Section; label: string }[] = [
  { value: 'one', label: 'One' },
  { value: 'two', label: 'Two' },
  { value: 'three', label: 'Three' },
]

const ANCHOR_ID = 'demo-content'

/** jsdom lays nothing out: the bar sticks 60px down, and is either there (stuck) or lower. */
function layOutAt(top: number, height = 44) {
  const bar = screen.getByRole('tablist').parentElement!
  bar.style.top = '60px'
  Object.defineProperty(bar, 'offsetHeight', { configurable: true, value: height })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    top,
    bottom: top,
    left: 0,
    right: 0,
    width: 0,
    height: 0,
    x: 0,
    y: top,
    toJSON: () => ({}),
  })
}

const layOut = (stuck: boolean) => layOutAt(stuck ? 60 : 150)

function runFramesNow() {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
}

/** The tabs holding the selection as a page does, over a section's content. */
function Page({ start = 'one', onChange }: { start?: Section; onChange?: (next: Section) => void }) {
  const [value, setValue] = useState<Section>(start)
  return (
    <SectionTabs
      id="demo"
      ariaLabel="Demo section"
      options={OPTIONS}
      value={value}
      onChange={(next) => {
        onChange?.(next)
        setValue(next)
      }}
    >
      <p>Content of {value}</p>
    </SectionTabs>
  )
}

/** The anchor the page's scroll helpers bring to the top, as the browser would scroll it. */
function scrollableAnchor() {
  const anchor = document.getElementById(ANCHOR_ID)!
  const scrollIntoView = vi.fn()
  anchor.scrollIntoView = scrollIntoView
  return scrollIntoView
}

function setScrollY(y: number) {
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(y)
}

// Without layout the bar counts as stuck, so a tap schedules a scroll: a real frame would run it
// during a later test.
beforeEach(runFramesNow)

afterEach(() => {
  vi.restoreAllMocks()
  // A spy made again on the same method keeps the calls the last test made to it.
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('style')
})

describe('SectionTabs', () => {
  it('is announced as tabs over one panel, named by the tab that is selected', () => {
    render(<Page start="two" />)

    expect(screen.getByRole('tablist', { name: 'Demo section' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['One', 'Two', 'Three'])
    const two = screen.getByRole('tab', { name: 'Two' })
    expect(two).toHaveAttribute('aria-selected', 'true')
    const panel = screen.getByRole('tabpanel')
    expect(two).toHaveAttribute('aria-controls', panel.id)
    expect(panel).toHaveAccessibleName('Two')
    expect(panel).toHaveTextContent('Content of two')
  })

  it('swaps the panel to the section that was tapped', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Page onChange={onChange} />)

    await user.click(screen.getByRole('tab', { name: 'Three' }))

    expect(onChange).toHaveBeenCalledWith('three')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Content of three')
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Three')
  })

  it('moves between sections with the arrow keys', async () => {
    const user = userEvent.setup()
    render(<Page />)
    screen.getByRole('tab', { name: 'One' }).focus()

    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('tab', { name: 'Two' })).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Content of two')
  })

  it('leaves ArrowDown to the page rather than moving to the next section', async () => {
    const user = userEvent.setup()
    render(<Page />)
    screen.getByRole('tab', { name: 'One' }).focus()

    await user.keyboard('{ArrowDown}')

    expect(screen.getByRole('tab', { name: 'One' })).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Content of one')
  })

  it('puts the anchor that content is scrolled to at the top of the panel', () => {
    render(<Page />)

    expect(screen.getByRole('tabpanel').firstElementChild).toBe(document.getElementById(ANCHOR_ID))
  })

  describe('when a section is tapped', () => {
    it('brings its content to the top, after it has been shown, when the bar is stuck', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<Page onChange={onChange} />)
      const scrollIntoView = scrollableAnchor()
      layOut(true)

      await user.click(screen.getByRole('tab', { name: 'Two' }))

      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
      expect(onChange.mock.invocationCallOrder[0]).toBeLessThan(scrollIntoView.mock.invocationCallOrder[0]!)
    })

    it('leaves the scroll alone when the bar has not left its place', async () => {
      const user = userEvent.setup()
      render(<Page />)
      const scrollIntoView = scrollableAnchor()
      layOut(false)

      await user.click(screen.getByRole('tab', { name: 'Two' }))

      expect(scrollIntoView).not.toHaveBeenCalled()
      expect(screen.getByRole('tabpanel')).toHaveTextContent('Content of two')
    })

    it('counts the bar as in its place within half a pixel of where it sticks, and not further', async () => {
      const user = userEvent.setup()
      render(<Page />)
      const scrollIntoView = scrollableAnchor()

      layOutAt(60.5)
      await user.click(screen.getByRole('tab', { name: 'Two' }))
      expect(scrollIntoView).toHaveBeenCalledTimes(1)

      layOutAt(60.6)
      await user.click(screen.getByRole('tab', { name: 'Three' }))
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
    })

    it('scrolls smoothly to the top of the content when the section already selected is tapped', async () => {
      const user = userEvent.setup()
      render(<Page />)
      const scrollIntoView = scrollableAnchor()
      layOut(true)

      await user.click(screen.getByRole('tab', { name: 'One' }))

      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    })

    it('does not scroll when the section already selected is tapped and the bar has not left its place', async () => {
      const user = userEvent.setup()
      render(<Page />)
      const scrollIntoView = scrollableAnchor()
      layOut(false)

      await user.click(screen.getByRole('tab', { name: 'One' }))

      expect(scrollIntoView).not.toHaveBeenCalled()
    })
  })

  describe('with sections to come back to', () => {
    function renderStuck() {
      const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
      const { unmount } = render(<Page />)
      const scrollIntoView = scrollableAnchor()
      layOut(true)
      return { scrollTo, scrollIntoView, unmount }
    }

    it('puts a section back where it was left, and sends one not seen before to its content', async () => {
      const user = userEvent.setup()
      const { scrollTo, scrollIntoView } = renderStuck()

      setScrollY(1400)
      await user.click(screen.getByRole('tab', { name: 'Two' }))
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      expect(scrollTo).not.toHaveBeenCalled()

      setScrollY(111)
      await user.click(screen.getByRole('tab', { name: 'One' }))
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 1400, behavior: 'auto' })
      expect(scrollIntoView).toHaveBeenCalledTimes(1)

      setScrollY(1400)
      await user.click(screen.getByRole('tab', { name: 'Two' }))
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 111, behavior: 'auto' })
    })

    it('keeps each section\'s own place, so one comes back where that one was left', async () => {
      const user = userEvent.setup()
      const { scrollTo } = renderStuck()

      setScrollY(300)
      await user.click(screen.getByRole('tab', { name: 'Two' }))
      setScrollY(2000)
      await user.click(screen.getByRole('tab', { name: 'Three' }))
      setScrollY(40)
      await user.click(screen.getByRole('tab', { name: 'One' }))
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 300, behavior: 'auto' })

      await user.click(screen.getByRole('tab', { name: 'Two' }))
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 2000, behavior: 'auto' })
    })

    it('forgets where the sections were left when the tabs go', async () => {
      const user = userEvent.setup()
      const { scrollTo, scrollIntoView, unmount } = renderStuck()
      setScrollY(900)
      await user.click(screen.getByRole('tab', { name: 'Two' }))
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      unmount()

      render(<Page />)
      scrollableAnchor()
      layOut(true)
      await user.click(screen.getByRole('tab', { name: 'Two' }))

      expect(scrollTo).not.toHaveBeenCalled()
    })
  })

  describe('as what the page keeps clear of', () => {
    it('sets the page\'s scroll padding to the bottom of the bar and a little air while it is mounted', () => {
      const { unmount } = render(<Page />)
      expect(document.documentElement.style.scrollPaddingTop).toBe('8px')

      unmount()
      expect(document.documentElement.style.scrollPaddingTop).toBe('')
    })

    it('counts where the bar sticks and how tall it is', () => {
      render(<Page />)
      layOut(true)
      // The padding was measured before the layout was written down; a resize measures it again.
      window.dispatchEvent(new Event('resize'))

      expect(document.documentElement.style.scrollPaddingTop).toBe('112px')
      expect(document.documentElement.style.getPropertyValue('--scroll-pad-top')).toBe('112px')
    })
  })
})

describe('SectionTabs styles', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/ui/components/SectionTabs.module.css'), 'utf8')
  const rule = (selector: string) =>
    new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^{}]*)\\}`).exec(css)?.[1] ?? ''

  it('sticks the bar under the app header, tucked beneath it, with the safe-area inset the header carries', () => {
    expect(rule('.bar')).toMatch(/position:\s*sticky/)
    expect(rule('.bar')).toMatch(
      /top:\s*calc\(var\(--exp-header\) - var\(--exp-subnav-tuck\) \+ env\(safe-area-inset-top, 0px\)\)/,
    )
    expect(rule('.bar')).toMatch(/height:\s*var\(--exp-subnav-h\)/)
  })

  it('fades what scrolls under the bar, and does not take its taps', () => {
    expect(rule('.bar::after')).toMatch(/linear-gradient/)
    expect(rule('.bar::after')).toMatch(/pointer-events:\s*none/)
  })

  it('takes the page\'s scroll padding back out for focus in the bar and for the content anchor', () => {
    expect(rule('.bar *')).toMatch(/scroll-margin-top:\s*calc\(-1 \* var\(--scroll-pad-top, 0px\)\)/)
    expect(rule('.anchor')).toMatch(/-\s+var\(--scroll-pad-top, 0px\)/)
  })

  it('lands the anchor under the bar, as high as the header and the bar less their tuck', () => {
    expect(rule('.anchor')).toMatch(
      /var\(--exp-header\) \+ var\(--exp-subnav-h\) - var\(--exp-subnav-tuck\) \+ env\(safe-area-inset-top, 0px\)/,
    )
  })

  it('has the bar as high as the rest of the desktop\'s segmented controls where there is a mouse', () => {
    const desktop = /@media \(min-width: 768px\) and \(pointer: fine\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''

    expect(desktop).toMatch(/--exp-subnav-h:\s*2\.25rem/)
  })
})
