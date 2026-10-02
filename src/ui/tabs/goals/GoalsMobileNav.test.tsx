import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adjustSectionId } from './adjustSections'
import { GoalsMobileNav } from './GoalsMobileNav'
import type { GoalsMobileView } from './goalsView'
import { GOALS_CONTENT_ANCHOR_ID, GOALS_NAV_ID } from './goalsAnchors'
import { useGoalsScrollMemory, type GoalsScrollMemory } from './useGoalsScrollMemory'

/** jsdom lays nothing out: the row sticks 60px down, and is either there (stuck) or lower. */
function layOut(stuck: boolean) {
  const top = stuck ? 60 : 150
  screen.getByRole('tablist').parentElement!.style.top = '60px'
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

/** The nav, with the content anchor the page would put under it, and a frame that runs at once. */
function renderNav(value: 'chart' | 'adjust' | 'progress' | 'assumptions', onChange = vi.fn()) {
  const target = document.createElement('div')
  target.id = GOALS_CONTENT_ANCHOR_ID
  const scrollIntoView = vi.fn()
  target.scrollIntoView = scrollIntoView
  document.body.append(target)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  const memory: GoalsScrollMemory = { leave: vi.fn(), recall: vi.fn(() => false) }
  render(<GoalsMobileNav value={value} onChange={onChange} memory={memory} />)
  return { onChange, scrollIntoView, memory }
}

/** The nav holding the selection and the memory, as the tab does, so a tap changes what it shows. */
function ControlledNav({ start }: { start: GoalsMobileView }) {
  const [value, setValue] = useState(start)
  const memory = useGoalsScrollMemory()
  return (
    <GoalsMobileNav
      value={value}
      memory={memory}
      onChange={(next) => {
        memory.leave(value)
        setValue(next)
      }}
    />
  )
}

describe('GoalsMobileNav', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    // A spy made again on the same method keeps the calls the last test made to it.
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    document.getElementById(GOALS_CONTENT_ANCHOR_ID)?.remove()
    document.getElementById(adjustSectionId('portfolio'))?.remove()
  })

  it('offers the four views and marks the current one', () => {
    renderNav('adjust')

    const labels = screen.getAllByRole('tab').map((r) => r.textContent)
    expect(labels).toEqual(['Chart', 'Adjust', 'Progress', 'Assumptions'])
    expect(screen.getByRole('tab', { name: 'Adjust' })).toHaveAttribute('aria-selected', 'true')
  })

  it('is the row that the scroll helpers measure as pinned, and keeps focus clear of it', () => {
    const memory: GoalsScrollMemory = { leave: vi.fn(), recall: vi.fn(() => false) }
    const { unmount } = render(<GoalsMobileNav value="chart" onChange={vi.fn()} memory={memory} />)

    expect(document.getElementById(GOALS_NAV_ID)).toContainElement(screen.getByRole('tablist'))
    expect(document.documentElement.style.scrollPaddingTop).not.toBe('')

    unmount()
    expect(document.documentElement.style.scrollPaddingTop).toBe('')
  })

  it('reports the view that was tapped', async () => {
    const user = userEvent.setup()
    const { onChange } = renderNav('chart')

    await user.click(screen.getByRole('tab', { name: 'Assumptions' }))

    expect(onChange).toHaveBeenCalledWith('assumptions')
  })

  it('brings the new view to the top, after it has been shown, when the row is stuck', async () => {
    const user = userEvent.setup()
    const { onChange, scrollIntoView } = renderNav('chart')
    layOut(true)

    await user.click(screen.getByRole('tab', { name: 'Progress' }))

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
    expect(onChange.mock.invocationCallOrder[0]).toBeLessThan(
      scrollIntoView.mock.invocationCallOrder[0]!,
    )
  })

  it('scrolls smoothly when the segment already selected is tapped', async () => {
    const user = userEvent.setup()
    const { scrollIntoView } = renderNav('chart')
    layOut(true)

    await user.click(screen.getByRole('tab', { name: 'Chart' }))

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('lands on the Adjust controls when Adjust is opened, even from the top of the page', async () => {
    const user = userEvent.setup()
    const { scrollIntoView } = renderNav('chart')
    const controls = document.createElement('details')
    controls.id = adjustSectionId('portfolio')
    document.body.append(controls)
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    layOut(false)

    await user.click(screen.getByRole('tab', { name: 'Adjust' }))

    expect(scrollBy).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('goes back to the top of Adjust, not to its controls, when Adjust is tapped again', async () => {
    const user = userEvent.setup()
    const { scrollIntoView } = renderNav('adjust')
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    layOut(true)

    await user.click(screen.getByRole('tab', { name: 'Adjust' }))

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('puts a view back where the tab remembers it, rather than going to its content', async () => {
    const user = userEvent.setup()
    const { memory, scrollIntoView } = renderNav('chart')
    vi.mocked(memory.recall).mockReturnValue(true)
    layOut(true)

    await user.click(screen.getByRole('tab', { name: 'Progress' }))

    expect(memory.recall).toHaveBeenCalledWith('progress')
    expect(scrollIntoView).not.toHaveBeenCalled()
    // Noting where the view was left is the tab's job, since links leave views too.
    expect(memory.leave).not.toHaveBeenCalled()
  })

  it('leaves the scroll alone when the row has not left its place', async () => {
    const user = userEvent.setup()
    const { onChange, scrollIntoView } = renderNav('chart')
    layOut(false)

    await user.click(screen.getByRole('tab', { name: 'Progress' }))

    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledWith('progress')
  })

  describe('with a view to come back to', () => {
    function setScrollY(y: number) {
      vi.spyOn(window, 'scrollY', 'get').mockReturnValue(y)
    }

    function renderControlled(start: GoalsMobileView) {
      const target = document.createElement('div')
      target.id = GOALS_CONTENT_ANCHOR_ID
      const scrollIntoView = vi.fn()
      target.scrollIntoView = scrollIntoView
      document.body.append(target)
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        cb(0)
        return 0
      })
      const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
      render(<ControlledNav start={start} />)
      layOut(true)
      return { scrollIntoView, scrollTo }
    }

    it('puts a view back where it was left, and sends a view not seen before to its content', async () => {
      const user = userEvent.setup()
      const { scrollIntoView, scrollTo } = renderControlled('chart')

      setScrollY(1400)
      await user.click(screen.getByRole('tab', { name: 'Progress' }))
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      expect(scrollTo).not.toHaveBeenCalled()

      setScrollY(111)
      await user.click(screen.getByRole('tab', { name: 'Chart' }))
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 1400, behavior: 'auto' })

      setScrollY(1400)
      await user.click(screen.getByRole('tab', { name: 'Progress' }))
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 111, behavior: 'auto' })
    })

    it('keeps each view\'s own place, so Adjust comes back where Adjust was left', async () => {
      const user = userEvent.setup()
      const controls = document.createElement('details')
      controls.id = adjustSectionId('portfolio')
      document.body.append(controls)
      vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
      const { scrollTo } = renderControlled('chart')

      setScrollY(300)
      await user.click(screen.getByRole('tab', { name: 'Adjust' }))
      setScrollY(2000)
      await user.click(screen.getByRole('tab', { name: 'Chart' }))
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 300, behavior: 'auto' })

      setScrollY(300)
      await user.click(screen.getByRole('tab', { name: 'Adjust' }))
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 2000, behavior: 'auto' })
    })

    it('still goes to the top of the content when the segment already selected is tapped', async () => {
      const user = userEvent.setup()
      const { scrollIntoView, scrollTo } = renderControlled('progress')

      setScrollY(900)
      await user.click(screen.getByRole('tab', { name: 'Progress' }))

      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
      expect(scrollTo).not.toHaveBeenCalled()
    })
  })
})
