import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActiveScenarioHeader } from './ActiveScenarioHeader'
import { makeScenario } from '../../../testing/factories'
import { makeActions } from '../../../testing/makeActions'
import type { GoalScenario } from '../../../types'

function renderHeader(scenario: GoalScenario, actions = makeActions()) {
  const { id, isActive, ...draft } = scenario
  void id
  void isActive
  const onPatch = vi.fn()
  render(
    <ActiveScenarioHeader
      draft={draft}
      activeScenario={scenario}
      scenarioCount={1}
      usedColors={[scenario.color]}
      dirty={false}
      canWrite
      actions={actions}
      onPatch={onPatch}
      onSaveChanges={vi.fn()}
      onDiscard={vi.fn()}
      onActivate={vi.fn()}
      onSaveDraft={vi.fn()}
      onScenarioCreated={vi.fn()}
    />,
  )
  return { actions, onPatch }
}

describe('ActiveScenarioHeader', () => {
  it('asks before deleting a scenario, and only deletes once confirmed', () => {
    const { actions } = renderHeader(makeScenario({ id: 7, name: 'Path B' }))

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Delete Path B?')).toBeInTheDocument()
    expect(actions.deleteScenario).not.toHaveBeenCalled()

    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    expect(actions.deleteScenario).toHaveBeenCalledWith(7)
  })

  it('keeps the scenario when the confirm is cancelled', () => {
    const { actions } = renderHeader(makeScenario({ id: 7, name: 'Path B' }))

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(actions.deleteScenario).not.toHaveBeenCalled()
  })

  it('warns that deleting the current plan leaves Progress with nothing to measure', () => {
    renderHeader(makeScenario({ id: 1, name: 'Path A', isActive: true }))

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.getByText(/It is your current plan/)).toBeInTheDocument()
  })
})
