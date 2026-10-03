import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActiveScenarioHeader } from './ActiveScenarioHeader'
import { makeScenario } from '../../../testing/factories'
import { makeActions } from '../../../testing/makeActions'
import type { GoalScenario } from '../../../types'

function renderHeader(
  scenario: GoalScenario,
  actions = makeActions(),
  { dirty = false, saving = false, creating = false }: { dirty?: boolean; saving?: boolean; creating?: boolean } = {},
) {
  const { id, isActive, ...draft } = scenario
  void id
  void isActive
  const onPatch = vi.fn()
  const onDuplicate = vi.fn()
  const { unmount } = render(
    <ActiveScenarioHeader
      draft={draft}
      activeScenario={scenario}
      dirty={dirty}
      saving={saving}
      creating={creating}
      canWrite
      actions={actions}
      onPatch={onPatch}
      onSaveChanges={vi.fn()}
      onDiscard={vi.fn()}
      onActivate={vi.fn()}
      onSaveDraft={vi.fn()}
      onDuplicate={onDuplicate}
    />,
  )
  return { actions, onPatch, onDuplicate, unmount }
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

  it('takes Save changes and Discard once there are edits, but not while a save is in flight', () => {
    const scenario = makeScenario({ id: 7, name: 'Path B' })
    const buttons = () => [
      screen.getByRole('button', { name: 'Save changes' }),
      screen.getByRole('button', { name: 'Discard' }),
    ]
    const { unmount } = renderHeader(scenario, makeActions(), { dirty: true })
    for (const button of buttons()) expect(button).toBeEnabled()
    unmount()

    renderHeader(scenario, makeActions(), { dirty: true, saving: true })
    for (const button of buttons()) expect(button).toBeDisabled()
  })

  it('hands Duplicate to the editor, and holds the button while a copy is being made', () => {
    const scenario = makeScenario({ id: 7, name: 'Path B' })
    const { actions, onDuplicate, unmount } = renderHeader(scenario)
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(onDuplicate).toHaveBeenCalledTimes(1)
    expect(actions.createScenario).not.toHaveBeenCalled()
    unmount()

    renderHeader(scenario, makeActions(), { creating: true })
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeDisabled()
  })

  it('changes colour through the draft rather than writing it straight away', () => {
    const { actions, onPatch } = renderHeader(makeScenario({ id: 7, color: '#6366f1' }))

    fireEvent.click(screen.getByRole('button', { name: 'Use color #10b981' }))

    expect(onPatch).toHaveBeenCalledWith({ color: '#10b981' })
    expect(actions.updateScenario).not.toHaveBeenCalled()
  })
})
