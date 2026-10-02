import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GoalsMobileNav } from './GoalsMobileNav'

/** jsdom lays nothing out: put the row where the app header would stick it, and the anchor
 *  either with it (nothing scrolled) or far above it (the row is stuck). */
function layOut(container: HTMLElement, stuck: boolean) {
  const [anchor] = Array.from(container.children)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const top = this === anchor && stuck ? -300 : 61
    return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) }
  })
}

describe('GoalsMobileNav', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  it('offers the four views and marks the current one', () => {
    render(<GoalsMobileNav value="adjust" onChange={() => {}} />)

    const labels = screen.getAllByRole('radio').map((r) => r.textContent)
    expect(labels).toEqual(['Chart', 'Adjust', 'Progress', 'Setup'])
    expect(screen.getByRole('radio', { name: 'Adjust' })).toBeChecked()
  })

  it('reports the view that was tapped', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<GoalsMobileNav value="chart" onChange={onChange} />)

    await user.click(screen.getByRole('radio', { name: 'Setup' }))

    expect(onChange).toHaveBeenCalledWith('setup')
  })

  it('brings the top of the page back first when the row is stuck, whichever segment is tapped', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { container } = render(<GoalsMobileNav value="chart" onChange={() => {}} />)
    layOut(container, true)

    await user.click(screen.getByRole('radio', { name: 'Progress' }))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.instances[0]).toBe(container.firstElementChild)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' })

    // The segment already selected is the usual way to ask for the top.
    await user.click(screen.getByRole('radio', { name: 'Chart' }))
    expect(scrollIntoView).toHaveBeenCalledTimes(2)
  })

  it('leaves the scroll alone when the row has not left its place', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const onChange = vi.fn()
    const { container } = render(<GoalsMobileNav value="chart" onChange={onChange} />)
    layOut(container, false)

    await user.click(screen.getByRole('radio', { name: 'Progress' }))

    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledWith('progress')
  })
})
