import { render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScrollAnchor } from './ScrollAnchor'

function rect(top: number): DOMRect {
  return { top, bottom: top + 62, height: 62, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }
}

function Page({ tick }: { tick: number }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <>
      <div ref={ref} data-tick={tick}>
        <div data-vrow="a" />
      </div>
      <ScrollAnchor list={ref} />
    </>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

/** The row's place on screen is read twice per update: just before React changes the DOM, and after. */
function moveRow(container: HTMLElement, before: number, after: number) {
  const row = container.querySelector<HTMLElement>('[data-vrow]')!
  vi.spyOn(row, 'getBoundingClientRect').mockReturnValueOnce(rect(before)).mockReturnValueOnce(rect(after))
}

describe('ScrollAnchor', () => {
  it('scrolls the page by how far the row at the top of the screen was pushed', () => {
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    const { container, rerender } = render(<Page tick={0} />)
    moveRow(container, 100, 130)
    rerender(<Page tick={1} />)
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith(0, 30)
  })

  it('scrolls back when the row was pulled up', () => {
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    const { container, rerender } = render(<Page tick={0} />)
    moveRow(container, 100, 76)
    rerender(<Page tick={1} />)
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith(0, -24)
  })

  it('leaves the page alone when the row stayed, give or take rounding', () => {
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    const { container, rerender } = render(<Page tick={0} />)
    moveRow(container, 100, 100.3)
    rerender(<Page tick={1} />)
    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('does nothing on the first render, when there is nothing to compare with', () => {
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    render(<Page tick={0} />)
    expect(scrollBy).not.toHaveBeenCalled()
  })
})
