import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GoalsTab } from './GoalsTab'
import { NARROW_MQ } from './useGoalsNarrow'
import { installFakeMatchMedia } from '../../../testing/fakeMatchMedia'
import { buildExpenseModel } from '../../buildExpenseModel'
import { makeDataset, makeScenario } from '../../../testing/factories'
import { makeActions } from '../../../testing/makeActions'
import { LeaveGuardProvider } from '../../nav/LeaveGuardProvider'
import { useGuardLeave } from '../../nav/leaveGuardContext'
import type { ExpenseActions } from '../../actions'
import type { ExpenseModel } from '../../useExpenseData'

let media: ReturnType<typeof installFakeMatchMedia>

beforeAll(() => {
  media = installFakeMatchMedia()
})

beforeEach(() => {
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  media.setMatching(() => false)
})

/** The shell's part: a way out of Goals and a way back, both through the guard as the real ones are. */
function Host({ model, actions }: { model: ExpenseModel; actions?: ExpenseActions | undefined }) {
  const guardLeave = useGuardLeave()
  const [where, setWhere] = useState('goals')
  const go = (to: string) => () => guardLeave(() => setWhere(to))
  return (
    <>
      <button type="button" onClick={go('dashboard')}>
        Dashboard
      </button>
      <button type="button" onClick={go('goals')}>
        Goals
      </button>
      {where === 'goals' ? <GoalsTab model={model} actions={actions} /> : <p>On the dashboard</p>}
    </>
  )
}

/** `actions` null is a read-only session, which has none. */
function renderGoals(model: ExpenseModel, actions: ExpenseActions | null = makeActions()) {
  return render(
    <LeaveGuardProvider>
      <Host model={model} actions={actions ?? undefined} />
    </LeaveGuardProvider>,
  )
}

const plan = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true })
const other = makeScenario({ id: 2, name: 'Path B', sortOrder: 1 })
const twoScenarios = () => buildExpenseModel(makeDataset({ goalScenarios: [plan, other] }))

/** Renames the open scenario from its menu: an edit to a saved scenario, not yet saved. */
async function rename(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: 'Scenario options' }))
  fireEvent.change(screen.getByLabelText('Scenario name'), { target: { value: name } })
  await user.keyboard('{Escape}')
}

const dashboardButton = () => screen.getByRole('button', { name: 'Dashboard' })
const sheet = () => screen.queryByRole('alertdialog')

describe('leaving Goals with unsaved edits', () => {
  it('asks first, naming the scenario, and offers Stay and Leave', async () => {
    const user = userEvent.setup()
    renderGoals(twoScenarios())
    await rename(user, 'Path A, tweaked')

    await user.click(dashboardButton())

    const dialog = screen.getByRole('alertdialog', { name: 'Leave without saving?' })
    expect(within(dialog).getByText(/Your changes to Path A will be lost if you leave/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Stay' })).toHaveFocus()
    expect(screen.queryByText('On the dashboard')).not.toBeInTheDocument()
  })

  it('keeps every edit on Stay, and asks again when leaving is tried again', async () => {
    const user = userEvent.setup()
    renderGoals(twoScenarios())
    await rename(user, 'Path A, tweaked')

    await user.click(dashboardButton())
    await user.click(screen.getByRole('button', { name: 'Stay' }))

    expect(sheet()).toBeNull()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Path A, tweaked/, selected: true })).toBeInTheDocument()
    expect(dashboardButton()).toHaveFocus()

    await user.click(dashboardButton())
    expect(sheet()).not.toBeNull()
  })

  it('goes on Leave, and the edit is gone when Goals is opened again', async () => {
    const user = userEvent.setup()
    renderGoals(twoScenarios())
    await rename(user, 'Path A, tweaked')

    await user.click(dashboardButton())
    await user.click(screen.getByRole('button', { name: 'Leave' }))

    expect(screen.getByText('On the dashboard')).toBeInTheDocument()
    expect(sheet()).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Goals' }))
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Path A/, selected: true })).not.toHaveTextContent('tweaked')
  })

  it('does not ask when nothing is unsaved', async () => {
    const user = userEvent.setup()
    renderGoals(twoScenarios())

    await user.click(dashboardButton())

    expect(sheet()).toBeNull()
    expect(screen.getByText('On the dashboard')).toBeInTheDocument()
  })

  it('does not ask once the edits are discarded', async () => {
    const user = userEvent.setup()
    renderGoals(twoScenarios())
    await rename(user, 'Path A, tweaked')
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))

    await user.click(dashboardButton())

    expect(sheet()).toBeNull()
    expect(screen.getByText('On the dashboard')).toBeInTheDocument()
  })

  it('does not ask when moving between Plan, Progress and Assumptions, and keeps the edit', async () => {
    const user = userEvent.setup()
    renderGoals(twoScenarios())
    await rename(user, 'Path A, tweaked')

    await user.click(screen.getByRole('tab', { name: 'Progress' }))
    await user.click(screen.getByRole('tab', { name: 'Assumptions' }))
    await user.click(screen.getByRole('tab', { name: 'Plan' }))

    expect(sheet()).toBeNull()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  it('leaves the question about switching scenario tabs as it was, and does not add this one to it', async () => {
    const user = userEvent.setup()
    renderGoals(twoScenarios())
    await rename(user, 'Path A, tweaked')

    await user.click(screen.getByRole('tab', { name: 'Path B' }))

    expect(screen.getByRole('alertdialog', { name: 'Discard unsaved changes to Path A?' })).toBeInTheDocument()
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1)
  })

  it('asks about a draft detached from any scenario, which no saved scenario holds', async () => {
    const user = userEvent.setup()
    renderGoals(twoScenarios())
    await rename(user, 'Path A, tweaked')
    await user.click(screen.getByRole('button', { name: 'Scenario options' }))
    await user.click(screen.getByRole('button', { name: 'Keep these edits as a draft' }))
    await user.keyboard('{Escape}')
    expect(screen.getByRole('tab', { name: 'Unsaved draft', selected: true })).toBeInTheDocument()

    await user.click(dashboardButton())

    const dialog = screen.getByRole('alertdialog', { name: 'Leave without saving?' })
    expect(within(dialog).getByText(/The unsaved draft will be lost if you leave/)).toBeInTheDocument()
    expect(within(dialog).getByText(/save it as a new scenario first/)).toBeInTheDocument()
  })

  it('does not ask about a draft with no edits', async () => {
    const user = userEvent.setup()
    renderGoals(twoScenarios())
    await rename(user, 'Path A, tweaked')
    await user.click(screen.getByRole('button', { name: 'Scenario options' }))
    await user.click(screen.getByRole('button', { name: 'Keep these edits as a draft' }))
    // Typed back to what the saved scenario says: the draft holds nothing it does not.
    await rename(user, 'Path A')
    expect(screen.getByRole('tab', { name: 'Unsaved draft', selected: true })).toBeInTheDocument()

    await user.click(dashboardButton())

    expect(sheet()).toBeNull()
  })

  it('tells a read-only session its changes cannot be saved, with no Save to stay for', async () => {
    const user = userEvent.setup()
    renderGoals(twoScenarios(), null)
    const field = screen.getByLabelText('Monthly investing', { exact: true })
    fireEvent.change(field, { target: { value: '12345' } })
    fireEvent.blur(field)

    await user.click(dashboardButton())

    const dialog = screen.getByRole('alertdialog', { name: 'Leave without saving?' })
    expect(within(dialog).getByText(/This session is read-only, so they can't be saved/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/save first/)).not.toBeInTheDocument()
  })

  it('goes without asking while the save is on its way, which finishes either way', async () => {
    const user = userEvent.setup()
    const actions = makeActions()
    let finish!: () => void
    vi.mocked(actions.updateScenario).mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    renderGoals(twoScenarios(), actions)
    await rename(user, 'Path A, tweaked')

    await user.click(screen.getByRole('button', { name: 'Save changes to Path A, tweaked' }))
    await user.click(dashboardButton())

    expect(sheet()).toBeNull()
    expect(screen.getByText('On the dashboard')).toBeInTheDocument()
    expect(actions.updateScenario).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish()
      await Promise.resolve()
    })
  })

  it('asks again if the save fails and the edits are still there', async () => {
    const user = userEvent.setup()
    const actions = makeActions()
    // A failed write is reported by the global toast and leaves the data as it was.
    vi.mocked(actions.updateScenario).mockResolvedValue(undefined)
    renderGoals(twoScenarios(), actions)
    await rename(user, 'Path A, tweaked')
    await user.click(screen.getByRole('button', { name: 'Save changes to Path A, tweaked' }))

    await user.click(dashboardButton())

    expect(sheet()).not.toBeNull()
  })

  it('asks on a phone too, where the same editor sits behind the Scenarios view', async () => {
    media.setMatching((query) => query === NARROW_MQ)
    const user = userEvent.setup()
    renderGoals(twoScenarios())
    await user.click(screen.getByRole('tab', { name: 'Scenarios' }))
    fireEvent.change(screen.getByLabelText('Scenario name'), { target: { value: 'Path A, tweaked' } })

    await user.click(dashboardButton())

    expect(screen.getByRole('alertdialog', { name: 'Leave without saving?' })).toBeInTheDocument()
  })
})
