import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChartHint } from './ChartHint'

afterEach(cleanup)

describe('the folded chart paragraph', () => {
  const hint = { lead: 'In 2026 euros.', rest: 'At a purchase year, return applies.' }

  it('folds everything but what the euros are behind "How to read this chart" for a plan with no saved scenario', () => {
    render(<ChartHint hint={hint} isHero savedScenarios={0} />)
    expect(screen.getByText(hint.lead).closest('details')).toBeNull()
    expect(screen.getByText('How to read this chart').closest('details')).not.toBeNull()
    expect(screen.getByText(hint.rest).closest('details')).not.toBeNull()
  })

  it('is one open paragraph as before with a saved scenario, with the same words', () => {
    render(<ChartHint hint={hint} isHero savedScenarios={1} />)
    expect(screen.queryByText('How to read this chart')).toBeNull()
    expect(screen.getByText('In 2026 euros. At a purchase year, return applies.').tagName).toBe('P')
  })

  it('leaves the smaller charts’ line alone, and says nothing without a hint', () => {
    const { container, rerender } = render(<ChartHint hint={hint} isHero={false} savedScenarios={0} />)
    expect(container.querySelector('details')).toBeNull()
    rerender(<ChartHint hint={null} isHero savedScenarios={0} />)
    expect(container).toBeEmptyDOMElement()
  })
})
