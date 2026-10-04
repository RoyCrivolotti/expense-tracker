import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ToastContext } from '../../hooks/useToast'
import { ActiveScenarioHeader } from './ActiveScenarioHeader'
import { makeScenario } from '../../../testing/factories'
import { makeActions } from '../../../testing/makeActions'
import type { GoalScenario } from '../../../types'

function renderHeader(
  scenario: GoalScenario,
  actions = makeActions(),
  {
    dirty = false,
    saving = false,
    creating = false,
    canWrite = true,
    detached = false,
  }: { dirty?: boolean; saving?: boolean; creating?: boolean; canWrite?: boolean; detached?: boolean } = {},
) {
  const { id, isActive, ...draft } = scenario
  void id
  void isActive
  const onPatch = vi.fn()
  const onDuplicate = vi.fn()
  const onSaveDraft = vi.fn()
  const onSaveChanges = vi.fn()
  const showToast = vi.fn()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ToastContext.Provider value={{ showToast }}>{children}</ToastContext.Provider>
  )
  const { unmount } = render(
    <ActiveScenarioHeader
      draft={draft}
      activeScenario={detached ? null : scenario}
      dirty={dirty}
      hasEdits={dirty}
      saving={saving}
      creating={creating}
      canWrite={canWrite}
      actions={actions}
      onPatch={onPatch}
      onSaveChanges={onSaveChanges}
      onDiscard={vi.fn()}
      onActivate={vi.fn()}
      onSaveDraft={onSaveDraft}
      onDuplicate={onDuplicate}
    />,
    { wrapper },
  )
  return { actions, onPatch, onDuplicate, onSaveDraft, onSaveChanges, showToast, unmount }
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

  describe('with no name to save under', () => {
    const HINT = 'Give the scenario a name to save it'

    it('turns Save changes off without disabling it, and a press says why instead of saving', () => {
      const { onSaveChanges, showToast } = renderHeader(makeScenario({ id: 7, name: '  ' }), makeActions(), { dirty: true })

      const save = screen.getByRole('button', { name: 'Save changes' })
      expect(save).toHaveAttribute('aria-disabled', 'true')
      expect(save).not.toBeDisabled()
      expect(save).toHaveAttribute('title', HINT)
      expect(save).toHaveAccessibleDescription(HINT)

      fireEvent.click(save)
      expect(showToast).toHaveBeenCalledWith(HINT)
      expect(onSaveChanges).not.toHaveBeenCalled()
    })

    it('does the same for a new scenario\'s Save, which had no reason at all', () => {
      const { onSaveDraft, showToast } = renderHeader(makeScenario({ id: 7, name: '' }), makeActions(), { detached: true })

      const save = screen.getByRole('button', { name: 'Save scenario' })
      expect(save).toHaveAttribute('aria-disabled', 'true')
      expect(save).not.toBeDisabled()
      expect(save).toHaveAccessibleDescription(HINT)

      fireEvent.click(save)
      expect(showToast).toHaveBeenCalledWith(HINT)
      expect(onSaveDraft).not.toHaveBeenCalled()
    })

    it('writes the reason nowhere in the card, so nothing in it is laid out for the reason', () => {
      renderHeader(makeScenario({ id: 7, name: '' }), makeActions(), { dirty: true })

      // One copy, the clipped description Save points at.
      expect(screen.getAllByText(HINT)).toHaveLength(1)
      expect(screen.getByText(HINT).className).toMatch(/srOnly/)
    })

    it('says it too for the name of a copy, which Save as new would otherwise leave unexplained', () => {
      const { onSaveDraft, showToast } = renderHeader(makeScenario({ id: 7, name: 'Path B' }), makeActions())
      fireEvent.click(screen.getByRole('button', { name: 'Save as new scenario…' }))
      fireEvent.change(screen.getByLabelText('Name for new scenario'), { target: { value: ' ' } })

      const saveAsNew = screen.getByRole('button', { name: 'Save as new' })
      expect(saveAsNew).toHaveAttribute('aria-disabled', 'true')
      expect(saveAsNew).toHaveAccessibleDescription(HINT)
      fireEvent.click(saveAsNew)
      expect(showToast).toHaveBeenCalledWith(HINT)
      expect(onSaveDraft).not.toHaveBeenCalled()

      fireEvent.change(screen.getByLabelText('Name for new scenario'), { target: { value: ' Path C ' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save as new' }))
      expect(onSaveDraft).toHaveBeenCalledWith('Path C')
    })

    it('says nothing once there is a name', () => {
      const { onSaveChanges, showToast } = renderHeader(makeScenario({ id: 7, name: 'Path B' }), makeActions(), { dirty: true })
      const save = screen.getByRole('button', { name: 'Save changes' })
      expect(screen.queryByText(HINT)).not.toBeInTheDocument()
      expect(save).not.toHaveAttribute('aria-disabled')
      expect(save).not.toHaveAccessibleDescription(HINT)
      fireEvent.click(save)
      expect(onSaveChanges).toHaveBeenCalledTimes(1)
      expect(showToast).not.toHaveBeenCalled()

      const { onSaveDraft } = renderHeader(makeScenario({ id: 8, name: ' Path C ' }), makeActions(), { detached: true })
      fireEvent.click(screen.getByRole('button', { name: 'Save scenario' }))
      expect(onSaveDraft).toHaveBeenCalledWith('Path C')
    })
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

  it('says what a read-only session does with edits once there are some', () => {
    const scenario = makeScenario({ id: 7, name: 'Path B' })
    const { unmount } = renderHeader(scenario, makeActions(), { canWrite: false })
    expect(screen.getByRole('status')).toHaveTextContent('Read-only session — scenarios cannot be saved.')
    unmount()

    renderHeader(scenario, makeActions(), { canWrite: false, dirty: true })
    expect(screen.getByRole('status')).toHaveTextContent('so these changes cannot be saved. They are lost when you leave Goals or reload.')
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })

  it('changes colour through the draft rather than writing it straight away', () => {
    const { actions, onPatch } = renderHeader(makeScenario({ id: 7, color: '#6366f1' }))

    fireEvent.click(screen.getByRole('button', { name: 'Use color #10b981' }))

    expect(onPatch).toHaveBeenCalledWith({ color: '#10b981' })
    expect(actions.updateScenario).not.toHaveBeenCalled()
  })
})
