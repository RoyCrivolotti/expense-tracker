import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseActions } from '../actions'
import { makeFlag, makeLabel } from '../../testing/factories'
import { FlagAutoLabelEditor } from './FlagAutoLabelEditor'

const trip = makeLabel({ id: 1, name: 'Japan trip' })
const work = makeLabel({ id: 2, name: 'Work trip', color: '#10b981', sortOrder: 1 })

function renderEditor(props: Partial<Parameters<typeof FlagAutoLabelEditor>[0]> = {}) {
  const flag = props.flag ?? makeFlag({ id: 7, name: 'Work travel' })
  const actions =
    props.actions ??
    ({
      updateFlag: vi.fn().mockResolvedValue(undefined),
      createLabel: vi.fn(),
    } as unknown as ExpenseActions)
  const onDone = props.onDone ?? vi.fn()
  const labels = props.labels ?? [trip, work]
  render(<FlagAutoLabelEditor flag={flag} labels={labels} actions={actions} onDone={onDone} />)
  return { flag, actions, onDone }
}

describe('FlagAutoLabelEditor', () => {
  it('opens on "No auto-label" when the flag has none configured', () => {
    renderEditor()

    expect(screen.getByRole('button', { name: /No auto-label/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('opens on the currently configured label', () => {
    const flag = makeFlag({ id: 7, name: 'Work travel', autoLabelId: 2 })
    renderEditor({ flag })

    expect(screen.getByRole('button', { name: /Work trip/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /No auto-label/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('lists every label as a choice', () => {
    renderEditor()

    expect(screen.getByRole('button', { name: /Japan trip/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Work trip/ })).toBeInTheDocument()
  })

  it('names the flag in its own explanation', () => {
    renderEditor()

    expect(screen.getByText(/Work travel/)).toBeInTheDocument()
  })

  it('saves the chosen label against the flag', async () => {
    const { flag, actions } = renderEditor()

    await userEvent.click(screen.getByRole('button', { name: /Japan trip/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(actions.updateFlag).toHaveBeenCalledWith(flag.id, { autoLabelId: 1 })
  })

  it('saves null when "No auto-label" is chosen for a flag that had one', async () => {
    const flag = makeFlag({ id: 7, name: 'Work travel', autoLabelId: 2 })
    const { actions } = renderEditor({ flag })

    await userEvent.click(screen.getByRole('button', { name: /No auto-label/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(actions.updateFlag).toHaveBeenCalledWith(7, { autoLabelId: null })
  })

  it('closes without saving on Cancel', async () => {
    const { actions, onDone } = renderEditor()

    await userEvent.click(screen.getByRole('button', { name: /Japan trip/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(actions.updateFlag).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalled()
  })

  it('closes after a successful save', async () => {
    const { onDone } = renderEditor()

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onDone).toHaveBeenCalled()
  })

  it('shows the failure and stays open when the save rejects', async () => {
    const actions = {
      updateFlag: vi.fn().mockRejectedValue(new Error('Network is down')),
      createLabel: vi.fn(),
    } as unknown as ExpenseActions
    const { onDone } = renderEditor({ actions })

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Network is down')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('hides an archived label that is not the current auto-label', () => {
    renderEditor({ labels: [trip, { ...work, active: false }] })

    expect(screen.queryByRole('button', { name: /Work trip/ })).not.toBeInTheDocument()
  })

  it('still offers the configured auto-label once archived, labelled as such', () => {
    const flag = makeFlag({ id: 7, name: 'Work travel', autoLabelId: 2 })
    renderEditor({ flag, labels: [trip, { ...work, active: false }] })

    expect(screen.getByRole('button', { name: /Work trip/ })).toBeInTheDocument()
    expect(screen.getByText(/archived/)).toBeInTheDocument()
  })

  it('creates a label in place and selects it as the auto-label', async () => {
    const created = makeLabel({ id: 9, name: 'Madrid trip' })
    const { flag, actions } = renderEditor({
      actions: {
        updateFlag: vi.fn().mockResolvedValue(undefined),
        createLabel: vi.fn().mockResolvedValue(created),
      } as unknown as ExpenseActions,
    })

    await userEvent.click(screen.getByRole('button', { name: '+ New label' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'New label name' }), 'Madrid trip{Enter}')
    expect(actions.createLabel).toHaveBeenCalled()

    // The picker's own `labels` prop is static in this isolated test (a real parent
    // re-renders it after a create), so the new id shows as an unresolved
    // placeholder rather than "Madrid trip" — Save is what proves it was selected.
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(actions.updateFlag).toHaveBeenCalledWith(flag.id, { autoLabelId: 9 })
  })
})
