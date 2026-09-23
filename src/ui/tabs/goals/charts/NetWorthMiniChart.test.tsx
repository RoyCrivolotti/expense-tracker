import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NetWorthMiniChart } from './NetWorthMiniChart'
import { makeScenario } from '../../../../testing/factories'

describe('NetWorthMiniChart', () => {
  it('draws the draft line and its band, and labels only the first and last year', () => {
    const { id, isActive, ...draft } = makeScenario({ horizonYears: 10, color: '#10b981' })
    void id
    void isActive
    const { container } = render(<NetWorthMiniChart draft={draft} />)

    const svg = screen.getByRole('img', { name: 'Projection of the scenario being edited' })
    expect(svg.getAttribute('viewBox')).toBe('0 0 360 120')
    // One filled band and one line, nothing else: no legend, no milestone lines.
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(2)
    expect(container.querySelector('[class*="legend"]')).toBeNull()
    const xLabels = [...container.querySelectorAll('text')]
      .map((t) => t.textContent)
      .filter((t) => t === '0' || t === '10')
    expect(xLabels).toEqual(['0', '10'])
  })
})
