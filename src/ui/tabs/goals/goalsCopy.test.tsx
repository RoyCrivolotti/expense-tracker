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
    expect(text.replace('the assumed inflation set in Assumptions', '')).not.toMatch(/assumptions/i)
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
  })
})
