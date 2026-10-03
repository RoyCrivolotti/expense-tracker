import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { GoalScenario } from '../../../../types'
import type { ExpenseActions } from '../../../actions'
import { installFakeMatchMedia } from '../../../../testing/fakeMatchMedia'
import { makeActions } from '../../../../testing/makeActions'
import { makeDataset, makeScenario } from '../../../../testing/factories'
import { useScenarioEditor } from '../useScenarioEditor'
import { ScenarioBar } from './ScenarioBar'

function Harness({ initial, actions }: { initial: GoalScenario[]; actions: ExpenseActions | undefined }) {
  const [scenarios, setScenarios] = useState(initial)
  const live = actions
    ? {
        ...actions,
        createScenario: async (input: Parameters<ExpenseActions['createScenario']>[0]) => {
          const made = makeScenario({ ...input, id: 100 + scenarios.length })
          setScenarios((prev) => [...prev, made])
          await actions.createScenario(input)
          return made
        },
      }
    : undefined
  const editor = useScenarioEditor(makeDataset({ goalScenarios: scenarios }), live, 0)
  return <ScenarioBar scenarios={scenarios} editor={editor} actions={live} />
}

const plan = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true, color: '#10b981' })
const other = makeScenario({ id: 2, name: 'Path B', sortOrder: 1, color: '#f59e0b' })

const tab = (name: string | RegExp) => screen.getByRole('tab', { name })
const openMenu = async () => userEvent.click(screen.getByRole('button', { name: 'Scenario options' }))

describe('ScenarioBar', () => {
  it('has a tab for each scenario with the one that is the plan marked, and the loaded one selected', () => {
    render(<Harness initial={[plan, other]} actions={makeActions()} />)
    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(tab('Path A Current plan')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Path B')).toHaveAttribute('aria-selected', 'false')
    expect(screen.queryByRole('tab', { name: 'Unsaved draft' })).not.toBeInTheDocument()
  })

  it('loads another scenario when its tab is chosen', async () => {
    render(<Harness initial={[plan, other]} actions={makeActions()} />)
    await userEvent.click(tab('Path B'))
    expect(tab('Path B')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Path A Current plan')).toHaveAttribute('aria-selected', 'false')
  })

  it('moves focus along the tabs with the arrows and loads one only on Enter', async () => {
    render(<Harness initial={[plan, other]} actions={makeActions()} />)
    tab('Path A Current plan').focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(tab('Path B')).toHaveFocus()
    expect(tab('Path B')).toHaveAttribute('aria-selected', 'false')
    await userEvent.keyboard('{Enter}')
    expect(tab('Path B')).toHaveAttribute('aria-selected', 'true')
  })

  it('puts the whole name of a scenario in its tab\'s tooltip, since a long one is cut short there', () => {
    const name = 'A very long scenario name that would make its tab as wide as the whole row of tabs'
    render(<Harness initial={[plan, makeScenario({ id: 3, name, sortOrder: 1 })]} actions={makeActions()} />)

    expect(within(tab(/^A very long/)).getByTitle(name)).toBeInTheDocument()
    expect(within(tab('Path A Current plan')).queryByTitle(name)).not.toBeInTheDocument()
  })

  it('keeps the selected tab as the tab stop', () => {
    render(<Harness initial={[plan, other]} actions={makeActions()} />)
    expect(tab('Path A Current plan')).toHaveAttribute('tabindex', '0')
    expect(tab('Path B')).toHaveAttribute('tabindex', '-1')
  })

  it('shows an unsaved draft tab and a way to save it when nothing is saved yet', async () => {
    const actions = makeActions()
    render(<Harness initial={[]} actions={actions} />)
    expect(tab('Unsaved draft')).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Save scenario' }))
    expect(actions.createScenario).toHaveBeenCalledTimes(1)
  })

  it('will not save a draft with no name', async () => {
    render(<Harness initial={[]} actions={makeActions()} />)
    await openMenu()
    expect(screen.queryByText('Give the scenario a name to save it')).not.toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Scenario name'))
    expect(screen.getByRole('button', { name: 'Save scenario' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByText('Give the scenario a name to save it')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save scenario' })).toHaveAccessibleDescription('Give the scenario a name to save it')
  })

  it('takes the hint away once the scenario has a name again', async () => {
    render(<Harness initial={[plan, other]} actions={makeActions()} />)
    await openMenu()
    await userEvent.clear(screen.getByLabelText('Scenario name'))
    await userEvent.keyboard('{Escape}')
    expect(screen.getByText('Give the scenario a name to save it')).toBeInTheDocument()

    await openMenu()
    await userEvent.type(screen.getByLabelText('Scenario name'), 'Path A!')
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByText('Give the scenario a name to save it')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes to Path A!' })).toBeEnabled()
  })

  it('says "Save changes" on its button, which has the room for it, and names the scenario to a screen reader', async () => {
    render(<Harness initial={[plan, other]} actions={makeActions()} />)

    await openMenu()
    await userEvent.type(screen.getByLabelText('Scenario name'), '!')
    await userEvent.keyboard('{Escape}')

    expect(screen.getByRole('button', { name: 'Save changes to Path A!' })).toHaveTextContent(/^Save changes$/)
  })

  it('will not save the edits to a scenario that has been given no name, and can still drop them', async () => {
    const actions = makeActions()
    render(<Harness initial={[plan, other]} actions={actions} />)

    await openMenu()
    await userEvent.clear(screen.getByLabelText('Scenario name'))
    await userEvent.keyboard('{Escape}')

    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled()
    // Said in words beside the button, since a tooltip is never shown on a touch screen.
    const hint = screen.getByText('Give the scenario a name to save it')
    expect(hint).toBeVisible()
    expect(save).toHaveAccessibleDescription('Give the scenario a name to save it')
    expect(save).not.toHaveAttribute('title')
    await userEvent.click(save)
    expect(actions.updateScenario).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeEnabled()
  })

  it('marks the open scenario as edited and offers to keep or drop the edits', async () => {
    const actions = makeActions()
    render(<Harness initial={[plan, other]} actions={actions} />)
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()

    await openMenu()
    await userEvent.type(screen.getByLabelText('Scenario name'), '!')
    await userEvent.keyboard('{Escape}')

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(tab(/^Path A! Current plan Edited$/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes to Path A!' }))
    expect(actions.updateScenario).toHaveBeenCalledTimes(1)
  })

  it('drops the edits on Discard and puts focus back on the tab', async () => {
    render(<Harness initial={[plan, other]} actions={makeActions()} />)
    await openMenu()
    await userEvent.type(screen.getByLabelText('Scenario name'), '!')
    await userEvent.keyboard('{Escape}')

    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
    expect(tab('Path A Current plan')).toBeInTheDocument()
    expect(tab('Path A Current plan')).toHaveFocus()
  })

  it('asks before loading another scenario over edits, and loads it when told to', async () => {
    render(<Harness initial={[plan, other]} actions={makeActions()} />)
    await openMenu()
    await userEvent.type(screen.getByLabelText('Scenario name'), '!')
    await userEvent.keyboard('{Escape}')

    await userEvent.click(tab('Path B'))
    const sheet = screen.getByRole('alertdialog')
    expect(within(sheet).getByText(/Discard unsaved changes to Path A\?/)).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Discard' }))
    expect(tab('Path B')).toHaveAttribute('aria-selected', 'true')
  })

  it('starts a new scenario as a copy of the open one and opens it', async () => {
    const actions = makeActions()
    render(<Harness initial={[plan, other]} actions={actions} />)
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate Path A as a new scenario' }))
    expect(actions.createScenario).toHaveBeenCalledTimes(1)
    expect(await screen.findAllByRole('tab')).toHaveLength(3)
    expect(screen.getAllByRole('tab').at(-1)).toHaveAttribute('aria-selected', 'true')
  })

  it('makes the open scenario the plan from the menu', async () => {
    const actions = makeActions()
    render(<Harness initial={[plan, other]} actions={actions} />)
    await userEvent.click(tab('Path B'))
    await openMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Use as my plan' }))
    expect(actions.activateScenario).toHaveBeenCalledWith(2)
    expect(screen.queryByRole('dialog', { name: 'Scenario options' })).not.toBeInTheDocument()
  })

  it('says so, instead of offering it, when the open scenario is the plan', async () => {
    render(<Harness initial={[plan, other]} actions={makeActions()} />)
    await openMenu()
    expect(screen.getByText('This is your current plan')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use as my plan' })).not.toBeInTheDocument()
  })

  it('duplicates from the menu', async () => {
    const actions = makeActions()
    render(<Harness initial={[plan, other]} actions={actions} />)
    await openMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(actions.createScenario).toHaveBeenCalledTimes(1)
  })

  it('asks before deleting, says what it does to the plan, and deletes on confirm', async () => {
    const actions = makeActions()
    render(<Harness initial={[plan, other]} actions={actions} />)
    await openMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const sheet = screen.getByRole('alertdialog')
    expect(within(sheet).getByText(/Delete Path A\?/)).toBeInTheDocument()
    expect(within(sheet).getByText(/It is your current plan/)).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete' }))
    expect(actions.deleteScenario).toHaveBeenCalledWith(1)
  })

  it('keeps the scenario when the delete question is cancelled', async () => {
    const actions = makeActions()
    render(<Harness initial={[plan, other]} actions={actions} />)
    await openMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))
    expect(actions.deleteScenario).not.toHaveBeenCalled()
  })

  it('saves the draft as a new scenario under a name, and Escape there closes only the name field', async () => {
    const actions = makeActions()
    render(<Harness initial={[plan, other]} actions={actions} />)
    await openMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Save as new scenario…' }))
    const name = screen.getByLabelText('Name for new scenario')
    expect(name).toHaveValue('Path A copy')

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByLabelText('Name for new scenario')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Scenario options' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save as new scenario…' }))
    await userEvent.clear(screen.getByLabelText('Name for new scenario'))
    expect(screen.getByRole('button', { name: 'Save as new' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Name for new scenario'), 'Path D')
    await userEvent.click(screen.getByRole('button', { name: 'Save as new' }))
    expect(actions.createScenario).toHaveBeenCalledWith(expect.objectContaining({ name: 'Path D' }))
  })

  it('lets the edits be kept as a draft, which then has a tab of its own', async () => {
    render(<Harness initial={[plan, other]} actions={makeActions()} />)
    await openMenu()
    expect(screen.queryByRole('button', { name: 'Keep these edits as a draft' })).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Scenario name'), '!')
    await userEvent.click(screen.getByRole('button', { name: 'Keep these edits as a draft' }))
    expect(tab('Unsaved draft')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Save scenario' })).toBeInTheDocument()
  })

  it('recolours the scenario from the menu, as an edit to save', async () => {
    render(<Harness initial={[plan, other]} actions={makeActions()} />)
    await openMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Use color #6366f1' }))
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  it('makes one copy for a double click on + Duplicate, and holds the button while it is made', async () => {
    let land!: () => void
    const actions = makeActions()
    vi.mocked(actions.createScenario).mockImplementation(
      () =>
        new Promise((resolve) => {
          land = () => resolve(makeScenario({ id: 9, name: 'Path A: Invest only (copy)' }))
        }),
    )
    render(<Harness initial={[plan, other]} actions={actions} />)
    const button = screen.getByRole('button', { name: 'Duplicate Path A as a new scenario' })

    await userEvent.dblClick(button)

    expect(actions.createScenario).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
    await act(async () => {
      land()
      await Promise.resolve()
    })
    expect(button).toBeEnabled()
  })

  it('opens the menu with focus on the scenario name', async () => {
    render(<Harness initial={[plan, other]} actions={makeActions()} />)
    await openMenu()
    expect(screen.getByLabelText('Scenario name')).toHaveFocus()
  })

  it('puts focus on the menu rather than its name on a touch screen, so the keyboard stays down', async () => {
    const media = installFakeMatchMedia((query) => query === '(pointer: coarse)')
    try {
      render(<Harness initial={[plan, other]} actions={makeActions()} />)
      await openMenu()
      expect(screen.getByRole('dialog', { name: 'Scenario options' })).toHaveFocus()
      expect(screen.getByLabelText('Scenario name')).not.toHaveFocus()
    } finally {
      media.setMatching(() => false)
    }
  })

  it('closes the menu with Escape and gives focus back to its button', async () => {
    render(<Harness initial={[plan, other]} actions={makeActions()} />)
    const trigger = screen.getByRole('button', { name: 'Scenario options' })
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Scenario options' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('can look but not change anything in a read-only session', () => {
    render(<Harness initial={[plan, other]} actions={undefined} />)
    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(screen.getByText(/Read-only session/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Scenario options' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /New scenario/ })).not.toBeInTheDocument()
  })

  it('offers no plan or delete for a draft that is not a saved scenario', async () => {
    render(<Harness initial={[]} actions={makeActions()} />)
    await openMenu()
    expect(screen.getByLabelText('Scenario name')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Duplicate' })).not.toBeInTheDocument()
    vi.clearAllMocks()
  })
})
