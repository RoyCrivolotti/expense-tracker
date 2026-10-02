import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adjustSectionId } from './adjustSections'
import { GoalsMobileNav } from './GoalsMobileNav'
import { GOALS_CONTENT_ANCHOR_ID } from './scrollToGoalsContent'

/** jsdom lays nothing out: put the row where the app header would stick it, and the anchor
 *  either with it (nothing scrolled) or far above it (the row is stuck). The anchor is
 *  whatever sits just before the row. */
function layOut(stuck: boolean) {
  const anchor = screen.getByRole('radiogroup').parentElement!.previousElementSibling
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const top = this === anchor && stuck ? -300 : 61
    return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) }
  })
}

/** The nav, with the content anchor the page would put under it, and a frame that runs at once. */
function renderNav(value: 'chart' | 'adjust' | 'progress' | 'setup', onChange = vi.fn()) {
  const target = document.createElement('div')
  target.id = GOALS_CONTENT_ANCHOR_ID
  const scrollIntoView = vi.fn()
  target.scrollIntoView = scrollIntoView
  document.body.append(target)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  render(<GoalsMobileNav value={value} onChange={onChange} />)
  return { onChange, scrollIntoView }
}

describe('GoalsMobileNav', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.getElementById(GOALS_CONTENT_ANCHOR_ID)?.remove()
    document.getElementById(adjustSectionId('portfolio'))?.remove()
  })

  it('offers the four views and marks the current one', () => {
    renderNav('adjust')

    const labels = screen.getAllByRole('radio').map((r) => r.textContent)
    expect(labels).toEqual(['Chart', 'Adjust', 'Progress', 'Setup'])
    expect(screen.getByRole('radio', { name: 'Adjust' })).toBeChecked()
  })

  it('reports the view that was tapped', async () => {
    const user = userEvent.setup()
    const { onChange } = renderNav('chart')

    await user.click(screen.getByRole('radio', { name: 'Setup' }))

    expect(onChange).toHaveBeenCalledWith('setup')
  })

  it('brings the new view to the top, after it has been shown, when the row is stuck', async () => {
    const user = userEvent.setup()
    const { onChange, scrollIntoView } = renderNav('chart')
    layOut(true)

    await user.click(screen.getByRole('radio', { name: 'Progress' }))

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

    await user.click(screen.getByRole('radio', { name: 'Chart' }))

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

    await user.click(screen.getByRole('radio', { name: 'Adjust' }))

    expect(scrollBy).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('goes back to the top of Adjust, not to its controls, when Adjust is tapped again', async () => {
    const user = userEvent.setup()
    const { scrollIntoView } = renderNav('adjust')
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    layOut(true)

    await user.click(screen.getByRole('radio', { name: 'Adjust' }))

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('leaves the scroll alone when the row has not left its place', async () => {
    const user = userEvent.setup()
    const { onChange, scrollIntoView } = renderNav('chart')
    layOut(false)

    await user.click(screen.getByRole('radio', { name: 'Progress' }))

    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledWith('progress')
  })
})
