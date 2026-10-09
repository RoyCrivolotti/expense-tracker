import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AssumptionsView } from './AssumptionsView'
import { GoalsExplainer } from './GoalsExplainer'
import { GoalsTab } from './GoalsTab'
import { buildExpenseModel } from '../../buildExpenseModel'
import { defaultExpenseSettings } from '../../../engine'
import { makeDataset } from '../../../testing/factories'
import { makeActions } from '../../../testing/makeActions'

// "Assumptions" is the name of a tab, holding what Progress is measured with. The Scenarios
// controls are not assumptions, or someone looking for the return rate opens the wrong tab.
describe('Goals copy that names the Assumptions tab', () => {
  it('introduces Plan without calling its controls assumptions', () => {
    render(<GoalsTab model={buildExpenseModel(makeDataset())} />)

    expect(screen.getByText(/when you can reach financial independence/)).toBeInTheDocument()
    expect(screen.queryByText(/different assumptions/)).not.toBeInTheDocument()
  })

  it('keeps the word for the tab, and the inflation set there, in the glossary', () => {
    const { container } = render(<GoalsExplainer />)

    const text = container.textContent ?? ''
    expect(text).toContain('the assumed inflation set in Assumptions')
    expect(text.replace('the assumed inflation set in Assumptions', '').replace('the Market bounce card in Assumptions', '')).not.toMatch(/assumptions/i)
  })

  it('says where the market bounce is set, since the spread card uses it before anything says what it is', () => {
    const { container } = render(<GoalsExplainer />)

    expect(container.textContent).toContain('You set it in the Market bounce card in Assumptions.')
  })

  it('introduces the Assumptions view in plain sentences', () => {
    render(
      <AssumptionsView
        accounts={[]}
        checkins={[]}
        settings={defaultExpenseSettings()}
        actions={makeActions()}
        onSettingsChange={vi.fn()}
      />,
    )

    const intro = screen.getByText(/Progress is measured with your milestones/)
    expect(intro.textContent).not.toContain(';')
    expect(intro.textContent).toContain('assumed inflation rate')
    // A pointer to where other inputs are, not part of what the intro defines.
    const pointer = screen.getByText('Return, growth and housing are per scenario, in Scenarios.')
    expect(pointer).not.toBe(intro)
  })
})
