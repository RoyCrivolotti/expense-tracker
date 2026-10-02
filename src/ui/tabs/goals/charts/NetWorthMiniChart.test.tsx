import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { installFakeMatchMedia } from '../../../../testing/fakeMatchMedia'
import { NetWorthMiniChart } from './NetWorthMiniChart'
import { makeScenario } from '../../../../testing/factories'
import type { NewGoalScenario } from '../../../../data/dataSource'

function draftOf(overrides: Parameters<typeof makeScenario>[0]): NewGoalScenario {
  const { id, isActive, ...draft } = makeScenario(overrides)
  void id
  void isActive
  return draft
}

describe('NetWorthMiniChart', () => {
  // The hook reads a media query, so the stub is put back to answering no, which is jsdom's own.
  afterEach(() => installFakeMatchMedia())

  it('is shorter on a short phone', () => {
    const { id, isActive, ...draft } = makeScenario({ horizonYears: 10 })
    void id
    void isActive
    installFakeMatchMedia((query) => query === '(max-device-height: 700px)')

    render(<NetWorthMiniChart draft={draft} />)

    const svg = screen.getByRole('img', { name: 'Projection of the scenario being edited' })
    expect(svg.getAttribute('viewBox')).toBe('0 0 360 96')
  })

  it('draws the draft line and its band, and labels only the first and last year', () => {
    const { id, isActive, ...draft } = makeScenario({ horizonYears: 10, color: '#10b981' })
    void id
    void isActive
    const { container } = render(<NetWorthMiniChart draft={draft} />)

    const svg = screen.getByRole('img', { name: 'Projection of the scenario being edited' })
    expect(svg.getAttribute('viewBox')).toBe('0 0 360 112')
    // One filled band and one line, nothing else: no legend, no milestone lines.
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(2)
    expect(container.querySelector('[class*="legend"]')).toBeNull()
    const xLabels = [...container.querySelectorAll('text')]
      .map((t) => t.textContent)
      .filter((t) => t === '0' || t === '10')
    expect(xLabels).toEqual(['0', '10'])
  })

  describe('end value readout', () => {
    // No return and no contributions: the line stays at the 100k it starts at.
    const flat = { horizonYears: 10, expectedRealReturn: 0, monthlyContributionCents: 0 }

    it('names the last year and where the line ends, outside the accessibility tree', () => {
      render(<NetWorthMiniChart draft={draftOf(flat)} />)

      const readout = screen.getByText('Year 10 · 100k €')
      expect(readout).toHaveAttribute('aria-hidden', 'true')
    })

    it('follows the draft, so a slider can be judged without reading the axis', () => {
      const { rerender } = render(<NetWorthMiniChart draft={draftOf(flat)} />)
      expect(screen.getByText('Year 10 · 100k €')).toBeInTheDocument()

      rerender(<NetWorthMiniChart draft={draftOf({ ...flat, expectedRealReturn: 0.07, horizonYears: 20 })} />)

      expect(screen.queryByText('Year 10 · 100k €')).not.toBeInTheDocument()
      expect(screen.getByText(/^Year 20 · 3\d\dk €$/)).toBeInTheDocument()
    })

    it('does not change the chart height', () => {
      const { rerender } = render(<NetWorthMiniChart draft={draftOf(flat)} />)
      const viewBox = () => screen.getByRole('img').getAttribute('viewBox')
      expect(viewBox()).toBe('0 0 360 112')

      rerender(<NetWorthMiniChart draft={draftOf({ ...flat, expectedRealReturn: 0.12 })} />)

      expect(viewBox()).toBe('0 0 360 112')
    })

    it('sits top-left, and drops to the bottom-left when the line runs along the top', () => {
      const { rerender } = render(<NetWorthMiniChart draft={draftOf({ horizonYears: 30 })} />)
      expect(screen.getByText(/^Year 30/)).toHaveAttribute('data-side', 'top')

      rerender(<NetWorthMiniChart draft={draftOf({ horizonYears: 30, expectedRealReturn: 0, monthlyContributionCents: 0 })} />)

      expect(screen.getByText(/^Year 30/)).toHaveAttribute('data-side', 'bottom')
    })
  })
})
