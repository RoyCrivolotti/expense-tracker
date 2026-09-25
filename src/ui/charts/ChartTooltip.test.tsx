import { render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ChartTooltip } from './ChartTooltip'

let docked = false

beforeAll(() => {
  // The docked tooltip reads a media query; jsdom has no matchMedia.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: docked,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ChartTooltip', () => {
  it('scrolls the docked tooltip into view by the least it takes, since it sits under the chart', () => {
    docked = true
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(<ChartTooltip title="Year 5" lines={[{ label: 'Plan', value: '1k €' }]} anchor={null} />)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Year 5')
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' })
  })

  it('floats beside the anchor on a wide screen, and scrolls nothing', () => {
    docked = false
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(<ChartTooltip title="Year 5" lines={[]} anchor={{ x: 10, y: 10 }} />)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Year 5')
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
