import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { GoalsTab } from './GoalsTab'
import { NARROW_MQ } from './useGoalsNarrow'
import { installFakeMatchMedia } from '../../../testing/fakeMatchMedia'
import { ToastContext } from '../../hooks/useToast'
import { buildExpenseModel } from '../../buildExpenseModel'
import { makeDataset, makeScenario, makeWealthAccount, makeWealthCheckin } from '../../../testing/factories'
import { makeActions } from '../../../testing/makeActions'
import { defaultExpenseSettings, planValueAtDate, DEFAULT_INFLATION_RATE } from '../../../engine'

let media: ReturnType<typeof installFakeMatchMedia>

beforeAll(() => {
  media = installFakeMatchMedia()
})

/** Phone width: one row of four views, where wide screens have the three-way switch. */
function mockPhoneWidth() {
  media.setMatching((query) => query === NARROW_MQ)
}

/** The plan tab has other steppers; this is the one beside the preview field. */
function stepPreviewUp() {
  const field = screen.getByLabelText('Preview inflation').parentElement!
  fireEvent.click(within(field).getByRole('button', { name: 'Increase Preview inflation' }))
}

function makeModel() {
  return buildExpenseModel(makeDataset())
}

type User = ReturnType<typeof userEvent.setup>

/** On a wide screen a scenario's name, colour and plan are in its options menu, not on the page. */
async function openScenarioMenu(user: User) {
  await user.click(screen.getByRole('button', { name: 'Scenario options' }))
}

/** Renames the open scenario from its menu, as an edit to save; the menu is closed again after. */
async function renameScenario(user: User, name: string) {
  await openScenarioMenu(user)
  fireEvent.change(screen.getByLabelText('Scenario name'), { target: { value: name } })
  await user.keyboard('{Escape}')
}

const scenarioTab = (name: string | RegExp, selected?: boolean) =>
  screen.getByRole('tab', { name, ...(selected === undefined ? {} : { selected }) })

describe('GoalsTab levers', () => {
  afterEach(() => {
    media.setMatching(() => false)
    vi.restoreAllMocks()
    // jsdom has no scrollIntoView; the test that stubs it must not leave it behind.
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  it('brings the inputs into view when they open below the fold, and does not move the page when they close', async () => {
    const user = userEvent.setup()
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    // The bar is held to the bottom edge, so the panel's place in the page is below the screen.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return { top: this.id === 'goals-all-inputs' ? 1013 : 0 } as DOMRect
    })
    render(<GoalsTab model={makeModel()} actions={makeActions()} />)

    await user.click(screen.getByRole('button', { name: 'All inputs' }))
    await waitFor(() => expect(scrollBy).toHaveBeenCalledTimes(1))
    // Down by how far below the top of the visible page it opened.
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number) as number }))
    expect((scrollBy.mock.calls[0]?.[0] as ScrollToOptions).top).toBeGreaterThan(900)

    await user.click(screen.getByRole('button', { name: 'All inputs' }))
    await act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))))
    expect(scrollBy).toHaveBeenCalledTimes(1)
  })

  const DEFAULTS = ['monthlyContributionCents', 'expectedRealReturn', 'horizonYears', 'housePurchaseYear', 'startInvestedCents']

  it('takes an input out of the bar with its star, saves the choice, and gives the input back to the panel', async () => {
    const user = userEvent.setup()
    const actions = makeActions()
    render(<GoalsTab model={makeModel()} actions={actions} />)

    await user.click(screen.getByRole('button', { name: 'Remove Horizon from the bar' }))

    expect(actions.updateSettings).toHaveBeenCalledWith({ goalLevers: DEFAULTS.filter((k) => k !== 'horizonYears') })
    expect(screen.queryByLabelText('Horizon (years)')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'All inputs' }))
    expect(screen.getByLabelText('Horizon (years)')).toBeInTheDocument()
  })

  it('puts an input from the panel in the bar with its star, at the end', async () => {
    const user = userEvent.setup()
    const actions = makeActions()
    render(<GoalsTab model={makeModel()} actions={actions} />)

    await user.click(screen.getByRole('button', { name: 'Remove Horizon from the bar' }))
    await user.click(screen.getByRole('button', { name: 'All inputs' }))
    await user.click(screen.getByRole('button', { name: 'Add House price to the bar' }))

    expect(actions.updateSettings).toHaveBeenLastCalledWith({
      goalLevers: [...DEFAULTS.filter((k) => k !== 'horizonYears'), 'housePriceCents'],
    })
    expect(screen.getByLabelText('House price')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Key inputs' })).getByLabelText('House price')).toBeInTheDocument()
  })

  it('shows the inputs the owner chose, and puts the five back with Reset', async () => {
    const user = userEvent.setup()
    const actions = makeActions()
    const dataset = makeDataset()
    dataset.settings = { ...dataset.settings, goalLevers: ['rentMonthlyCents'] }
    render(<GoalsTab model={buildExpenseModel(dataset)} actions={actions} />)

    const bar = screen.getByRole('group', { name: 'Key inputs' })
    expect(within(bar).getByLabelText('Rent (monthly)')).toBeInTheDocument()
    expect(within(bar).queryByLabelText('Monthly investing')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'All inputs' }))
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }))
    expect(actions.updateSettings).toHaveBeenCalledWith({ goalLevers: DEFAULTS })
  })

  it('shows the bar as it was saved, with no stars to press, in a read-only session', async () => {
    const user = userEvent.setup()
    render(<GoalsTab model={makeModel()} />)

    expect(screen.queryByRole('button', { name: /from the bar$/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'All inputs' }))
    expect(screen.getByLabelText('House price')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /to the bar$/ })).not.toBeInTheDocument()
  })
})

describe('GoalsTab', () => {
  // Opening Scenarios scrolls to its controls, which jsdom does not implement. The scrolls wait
  // a frame; a real one would run inside whichever test comes next, so the frame runs at once.
  let scrollBy: MockInstance
  beforeEach(() => {
    scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
  })

  // jsdom has no scrollIntoView; tests that stub it must not leave it behind.
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
    media.setMatching(() => false)
  })

  it('renders with Plan view by default', () => {
    render(<GoalsTab model={makeModel()} />)
    expect(screen.getByRole('tab', { name: 'Plan' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Progress' })).toBeInTheDocument()
  })

  it('switches to Progress view when Progress tab is selected', async () => {
    const user = userEvent.setup()
    render(<GoalsTab model={makeModel()} />)

    await user.click(screen.getByRole('tab', { name: 'Progress' }))

    expect(screen.getByText('Progress snapshot')).toBeInTheDocument()
  })

  it('keeps milestones and accounts in Assumptions, out of Progress', async () => {
    const user = userEvent.setup()
    const model = buildExpenseModel(
      makeDataset({ wealthAccounts: [makeWealthAccount({ id: 1, name: 'Broker' })] }),
    )
    render(<GoalsTab model={model} actions={makeActions()} />)

    await user.click(screen.getByRole('tab', { name: 'Progress' }))
    expect(screen.getByText('Progress snapshot')).toBeInTheDocument()
    expect(screen.queryByText('Wealth accounts')).not.toBeInTheDocument()
    expect(screen.queryByText('Milestones')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Assumptions' }))
    expect(screen.getByText('Wealth accounts')).toBeInTheDocument()
    expect(screen.getByText('Milestones')).toBeInTheDocument()
    expect(screen.getByText('Broker')).toBeInTheDocument()
    expect(screen.queryByText('Progress snapshot')).not.toBeInTheDocument()
  })

  it('writes milestone edits made in Assumptions to settings', async () => {
    const user = userEvent.setup()
    const actions = makeActions()
    render(<GoalsTab model={makeModel()} actions={actions} />)

    await user.click(screen.getByRole('tab', { name: 'Assumptions' }))
    await user.click(screen.getByText('+ Add milestone'))

    expect(actions.updateSettings).toHaveBeenCalledTimes(1)
    const patch = vi.mocked(actions.updateSettings).mock.calls[0]![0]
    expect(patch.milestones).toHaveLength(defaultExpenseSettings().milestones.length + 1)
  })

  it('opens on Progress with the check-in form up when sent for a check-in', () => {
    const model = buildExpenseModel(
      makeDataset({ wealthAccounts: [makeWealthAccount({ id: 1, name: 'Broker' })] }),
    )
    render(<GoalsTab model={model} actions={makeActions()} entry="checkin" />)

    expect(screen.getByRole('tab', { name: 'Progress' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Save check-in' })).toBeInTheDocument()
  })

  it('opens the check-in form once, not again after a trip to Plan and back', async () => {
    const user = userEvent.setup()
    const model = buildExpenseModel(
      makeDataset({ wealthAccounts: [makeWealthAccount({ id: 1, name: 'Broker' })] }),
    )
    render(<GoalsTab model={model} actions={makeActions()} entry="checkin" />)
    expect(screen.getByRole('button', { name: 'Save check-in' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Plan' }))
    await user.click(screen.getByRole('tab', { name: 'Progress' }))
    expect(screen.queryByRole('button', { name: 'Save check-in' })).not.toBeInTheDocument()
  })

  it('shows a hidden scenario again when it is loaded for editing', async () => {
    const user = userEvent.setup()
    const plan = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true })
    const other = makeScenario({ id: 2, name: 'Path B', sortOrder: 1 })
    const model = buildExpenseModel(makeDataset({ goalScenarios: [plan, other] }))
    render(<GoalsTab model={model} actions={makeActions()} />)

    await user.click(screen.getByRole('button', { name: 'Hide Path B on chart' }))
    expect(screen.getByRole('button', { name: 'Show Path B on chart' })).toBeInTheDocument()

    await user.click(scenarioTab('Path B'))
    expect(screen.queryByRole('button', { name: 'Show Path B on chart' })).not.toBeInTheDocument()
  })

  it('hides a scenario from the hero legend and keeps its tab', async () => {
    const user = userEvent.setup()
    const plan = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true })
    const other = makeScenario({ id: 2, name: 'Path B', sortOrder: 1 })
    const model = buildExpenseModel(makeDataset({ goalScenarios: [plan, other] }))
    render(<GoalsTab model={model} actions={makeActions()} />)

    await user.click(screen.getByRole('button', { name: 'Hide Path B on chart' }))

    // The legend row now offers to show it again, and the scenario is still there to load.
    expect(screen.getByRole('button', { name: 'Show Path B on chart' })).toBeInTheDocument()
    expect(scenarioTab('Path B')).toBeInTheDocument()
  })

  it('takes an empty Progress view to Assumptions', async () => {
    const user = userEvent.setup()
    render(<GoalsTab model={makeModel()} actions={makeActions()} />)

    await user.click(screen.getByRole('tab', { name: 'Progress' }))
    await user.click(screen.getByRole('button', { name: 'Set up accounts' }))

    expect(screen.getByRole('tab', { name: 'Assumptions' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Wealth accounts')).toBeInTheDocument()
  })

  it('lands on the accounts in Assumptions when the empty Progress view sends the user to set them up, and only then', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(<GoalsTab model={makeModel()} actions={makeActions()} />)
    await user.click(screen.getByRole('tab', { name: 'Progress' }))

    await user.click(screen.getByRole('button', { name: 'Set up accounts' }))

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
    expect(scrollIntoView.mock.contexts[0]).toContainElement(screen.getByText('Wealth accounts'))

    // Coming back to Assumptions by the switcher is not a request to scroll to it.
    await user.click(screen.getByRole('tab', { name: 'Progress' }))
    await user.click(screen.getByRole('tab', { name: 'Assumptions' }))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('shows Plan view content when Plan tab is active', () => {
    render(<GoalsTab model={makeModel()} />)
    expect(screen.getByText(/Invested portfolio projection/i)).toBeInTheDocument()
  })

  it('narrates the milestones configured in settings, not the built-in ladder', () => {
    const model = buildExpenseModel(
      makeDataset({
        settings: {
          ...defaultExpenseSettings(),
          milestones: [{ amountCents: 12_300_000, label: 'Freedom fund' }],
        },
      }),
    )
    render(<GoalsTab model={model} />)
    expect(screen.getAllByText(/Freedom fund/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/€1M/)).not.toBeInTheDocument()
  })

  it('renders hero chart without crash when check-ins exist for active scenario', () => {
    const account = makeWealthAccount({ id: 1, kind: 'investment' })
    const scenario = makeScenario({
      id: 1,
      planStartDate: '2024-01-01',
    })
    const checkin = makeWealthCheckin({
      id: 1,
      checkinDate: '2024-07-01',
      entries: [{ accountId: 1, valueCents: 15_000_000 }],
    })
    const model = buildExpenseModel(
      makeDataset({
        goalScenarios: [scenario],
        wealthAccounts: [account],
        wealthCheckins: [checkin],
      }),
    )
    render(<GoalsTab model={model} />)
    expect(screen.getByText(/Invested portfolio projection/i)).toBeInTheDocument()
  })

  it('offers to make the loaded scenario the plan, and says so once it is', async () => {
    const user = userEvent.setup()
    const actions = makeActions()
    const plan = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true })
    const other = makeScenario({ id: 2, name: 'Path B', sortOrder: 1 })
    const model = buildExpenseModel(makeDataset({ goalScenarios: [plan, other] }))
    render(<GoalsTab model={model} actions={actions} />)

    // Opens on the plan, which is labelled rather than offered.
    expect(scenarioTab('Path A Current plan')).toBeInTheDocument()
    await openScenarioMenu(user)
    expect(screen.getByText('This is your current plan')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use as my plan' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(scenarioTab('Path B'))
    await openScenarioMenu(user)
    await user.click(screen.getByRole('button', { name: 'Use as my plan' }))

    expect(actions.activateScenario).toHaveBeenCalledWith(2)
  })

  it('saves a monthly-investing change added in the editor, as an edit to the scenario and nothing else', async () => {
    const user = userEvent.setup()
    const actions = makeActions()
    const plan = makeScenario({
      id: 1,
      name: 'Path A',
      isActive: true,
      planStartDate: '2026-06-25',
      monthlyContributionCents: 150_000,
    })
    render(<GoalsTab model={buildExpenseModel(makeDataset({ goalScenarios: [plan] }))} actions={actions} />)

    await user.click(screen.getByRole('button', { name: 'All inputs' }))
    await user.click(screen.getByRole('button', { name: '+ Add a change' }))
    // The form opens on the month after the plan starts, at the amount the scenario starts with.
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(screen.getByText("from Jul '26")).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save changes to Path A' }))
    expect(actions.updateScenario).toHaveBeenCalledWith(1, {
      contributionSchedule: [{ from: '2026-07', monthlyCents: 150_000 }],
    })
  })

  it('asks before a tab switch drops unsaved edits, and keeps them on Cancel', async () => {
    const user = userEvent.setup()
    const plan = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true })
    const other = makeScenario({ id: 2, name: 'Path B', sortOrder: 1 })
    const model = buildExpenseModel(makeDataset({ goalScenarios: [plan, other] }))
    render(<GoalsTab model={model} actions={makeActions()} />)

    await renameScenario(user, 'Path A, tweaked')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    await user.click(scenarioTab('Path B'))
    expect(screen.getByText('Discard unsaved changes to Path A?')).toBeInTheDocument()
    // The open tab follows the name as it is typed, and stays on it while the question is up.
    expect(scenarioTab(/Path A, tweaked/, true)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(scenarioTab(/Path A, tweaked/, true)).toBeInTheDocument()

    await user.click(scenarioTab('Path B'))
    // The row has its own Discard button; the one in the sheet is the answer.
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Discard' }))
    expect(scenarioTab('Path B', true)).toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
  })

  it('keeps the editor in step with a re-baseline made from Progress', async () => {
    const user = userEvent.setup()
    const actions = makeActions()
    const plan = makeScenario({ id: 1, name: 'Path A', isActive: true, planStartDate: '2025-01-01' })
    const accounts = [makeWealthAccount({ id: 1, name: 'Broker', kind: 'investment' })]
    const behind = (id: number, date: string) =>
      makeWealthCheckin({
        id,
        checkinDate: date,
        entries: [{ accountId: 1, valueCents: planValueAtDate(plan, date, DEFAULT_INFLATION_RATE)! - 50_000_00 }],
      })
    const checkins = [behind(1, '2026-01-01'), behind(2, '2026-04-01'), behind(3, '2026-07-15')]
    const dataset = makeDataset({ goalScenarios: [plan], wealthAccounts: accounts, wealthCheckins: checkins })
    const { rerender } = render(<GoalsTab model={buildExpenseModel(dataset)} actions={actions} />)

    await user.click(screen.getByRole('tab', { name: 'Progress' }))
    await user.click(screen.getByRole('button', { name: 'Re-baseline from latest check-in' }))
    // It asks first, since it writes the plan straight away.
    expect(actions.updateScenario).not.toHaveBeenCalled()
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Re-baseline' }))
    const patch = { startInvestedCents: planValueAtDate(plan, '2026-07-15', DEFAULT_INFLATION_RATE)! - 50_000_00, planStartDate: '2026-07-15' }
    expect(actions.updateScenario).toHaveBeenCalledWith(1, expect.objectContaining(patch))

    // The write lands and the dataset refreshes; the draft must already agree with it,
    // or the header would offer to save the old start back over the re-baseline.
    // What the plan is saved as is what was written, which counts the amounts in the euros of the new start too.
    const written = vi.mocked(actions.updateScenario).mock.calls[0]![1]
    const saved = { ...plan, ...patch, ...written }
    rerender(<GoalsTab model={buildExpenseModel({ ...dataset, goalScenarios: [saved] })} actions={actions} />)
    await user.click(screen.getByRole('tab', { name: 'Plan' }))
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
  })

  it('leaves the editor alone and says so when the re-baseline write fails', async () => {
    const user = userEvent.setup()
    const showToast = vi.fn()
    const actions = makeActions()
    vi.mocked(actions.updateScenario).mockRejectedValue(new Error('boom'))
    const plan = makeScenario({ id: 1, name: 'Path A', isActive: true, planStartDate: '2025-01-01' })
    const accounts = [makeWealthAccount({ id: 1, name: 'Broker', kind: 'investment' })]
    // The button belongs to the steady-gap hint, which needs three check-ins over half a year.
    const behind = (id: number, date: string) =>
      makeWealthCheckin({
        id,
        checkinDate: date,
        entries: [{ accountId: 1, valueCents: planValueAtDate(plan, date, DEFAULT_INFLATION_RATE)! - 50_000_00 }],
      })
    const checkins = [behind(1, '2026-01-01'), behind(2, '2026-04-01'), behind(3, '2026-07-15')]
    const dataset = makeDataset({ goalScenarios: [plan], wealthAccounts: accounts, wealthCheckins: checkins })
    render(
      <ToastContext.Provider value={{ showToast }}>
        <GoalsTab model={buildExpenseModel(dataset)} actions={actions} />
      </ToastContext.Provider>,
    )

    await user.click(screen.getByRole('tab', { name: 'Progress' }))
    await user.click(screen.getByRole('button', { name: 'Re-baseline from latest check-in' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Re-baseline' }))

    expect(showToast).toHaveBeenCalledWith("Something went wrong, so that change probably wasn't saved.", 'error')
    // Nothing was written, so Plan must not offer to save a start that never landed.
    await user.click(screen.getByRole('tab', { name: 'Plan' }))
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
  })

  it('saves a pending edit together with a re-baseline, not over it', async () => {
    const user = userEvent.setup()
    const actions = makeActions()
    const plan = makeScenario({ id: 1, name: 'Path A', isActive: true, planStartDate: '2025-01-01' })
    const accounts = [makeWealthAccount({ id: 1, name: 'Broker', kind: 'investment' })]
    const behind = (id: number, date: string) =>
      makeWealthCheckin({
        id,
        checkinDate: date,
        entries: [{ accountId: 1, valueCents: planValueAtDate(plan, date, DEFAULT_INFLATION_RATE)! - 50_000_00 }],
      })
    const checkins = [behind(1, '2026-01-01'), behind(2, '2026-04-01'), behind(3, '2026-07-15')]
    const model = buildExpenseModel(makeDataset({ goalScenarios: [plan], wealthAccounts: accounts, wealthCheckins: checkins }))
    render(<GoalsTab model={model} actions={actions} />)

    await renameScenario(user, 'Path A, tweaked')
    await user.click(screen.getByRole('tab', { name: 'Progress' }))
    await user.click(screen.getByRole('button', { name: 'Re-baseline from latest check-in' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Re-baseline' }))
    await user.click(screen.getByRole('tab', { name: 'Plan' }))
    await user.click(screen.getByRole('button', { name: 'Save changes to Path A, tweaked' }))

    expect(actions.updateScenario).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({
        name: 'Path A, tweaked',
        startInvestedCents: planValueAtDate(plan, '2026-07-15', DEFAULT_INFLATION_RATE)! - 50_000_00,
        planStartDate: '2026-07-15',
      }),
    )
  })

  it('keeps an unsaved life-event edit through a re-baseline from Progress', async () => {
    const user = userEvent.setup()
    const actions = makeActions()
    const plan = makeScenario({
      id: 1,
      name: 'Path A',
      isActive: true,
      planStartDate: '2024-07-15',
      lifeEvents: [
        { year: 3, amountCents: -20_000_00, label: 'Car' },
        { year: 5, amountCents: 30_000_00, label: 'Gift' },
      ],
    })
    const accounts = [makeWealthAccount({ id: 1, name: 'Broker', kind: 'investment' })]
    const behind = (id: number, date: string) =>
      makeWealthCheckin({
        id,
        checkinDate: date,
        entries: [{ accountId: 1, valueCents: planValueAtDate(plan, date, DEFAULT_INFLATION_RATE)! - 50_000_00 }],
      })
    const checkins = [behind(1, '2026-01-01'), behind(2, '2026-04-01'), behind(3, '2026-07-15')]
    const dataset = makeDataset({ goalScenarios: [plan], wealthAccounts: accounts, wealthCheckins: checkins })
    const { rerender } = render(<GoalsTab model={buildExpenseModel(dataset)} actions={actions} />)

    // An edit in the editor that has not been saved: the car is taken out.
    await user.click(screen.getByRole('button', { name: 'All inputs' }))
    fireEvent.click(screen.getByLabelText('Remove Car'))
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Progress' }))
    await user.click(screen.getByRole('button', { name: 'Re-baseline from latest check-in' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Re-baseline' }))

    // The write is the saved plan's, which still has the car (a year 1 event now).
    expect(actions.updateScenario).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        // Two years on at 2%: 20.000 and 30.000 of 2024 euros are a little more in the euros of the new start.
        lifeEvents: [
          { year: 1, amountCents: Math.round(-20_000_00 * 1.02 ** 2), label: 'Car' },
          { year: 3, amountCents: Math.round(30_000_00 * 1.02 ** 2), label: 'Gift' },
        ],
      }),
    )
    const patch = vi.mocked(actions.updateScenario).mock.calls[0]![1]
    rerender(<GoalsTab model={buildExpenseModel({ ...dataset, goalScenarios: [{ ...plan, ...patch }] })} actions={actions} />)
    await user.click(screen.getByRole('tab', { name: 'Plan' }))

    // The draft moved from its own values: the gift carries over, and the car stays taken out
    // rather than coming back from the saved plan. It is still an edit nobody has saved.
    await user.click(screen.getByRole('button', { name: 'All inputs' }))
    expect(screen.queryByLabelText('Remove Car')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Remove Gift')).toBeInTheDocument()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  it('says which life events a re-baseline moves or drops before writing them', async () => {
    const user = userEvent.setup()
    const actions = makeActions()
    const plan = makeScenario({
      id: 1,
      name: 'Path A',
      isActive: true,
      planStartDate: '2024-07-15',
      housePurchaseYear: 4,
      lifeEvents: [
        { year: 1, amountCents: 5_000_00, label: 'Bonus' },
        { year: 3, amountCents: -20_000_00, label: 'Car' },
      ],
    })
    const accounts = [makeWealthAccount({ id: 1, name: 'Broker', kind: 'investment' })]
    const behind = (id: number, date: string) =>
      makeWealthCheckin({
        id,
        checkinDate: date,
        entries: [{ accountId: 1, valueCents: planValueAtDate(plan, date, DEFAULT_INFLATION_RATE)! - 50_000_00 }],
      })
    const checkins = [behind(1, '2026-01-01'), behind(2, '2026-04-01'), behind(3, '2026-07-15')]
    const model = buildExpenseModel(makeDataset({ goalScenarios: [plan], wealthAccounts: accounts, wealthCheckins: checkins }))
    render(<GoalsTab model={model} actions={actions} />)

    await user.click(screen.getByRole('tab', { name: 'Progress' }))
    await user.click(screen.getByRole('button', { name: 'Re-baseline from latest check-in' }))
    const sheet = screen.getByRole('alertdialog')
    // It says what it replaces as well as what it puts in, and names the dropped event by its date.
    expect(sheet).toHaveTextContent(/restarts on .*2026 from .*, instead of .*2024 from /)
    expect(sheet).toHaveTextContent(/Bonus \(.*2025\) is already in the balance, so it is dropped\./)
    await user.click(within(sheet).getByRole('button', { name: 'Cancel' }))
    expect(actions.updateScenario).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Re-baseline from latest check-in' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Re-baseline' }))
    expect(actions.updateScenario).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        planStartDate: '2026-07-15',
        lifeEvents: [{ year: 1, amountCents: Math.round(-20_000_00 * 1.02 ** 2), label: 'Car' }],
        housePurchaseYear: 2,
      }),
    )
  })

  it('confirms a save with a toast that names the scenario', async () => {
    const user = userEvent.setup()
    const showToast = vi.fn()
    const plan = makeScenario({ id: 1, name: 'Path A', isActive: true })
    render(
      <ToastContext.Provider value={{ showToast }}>
        <GoalsTab model={buildExpenseModel(makeDataset({ goalScenarios: [plan] }))} actions={makeActions()} />
      </ToastContext.Provider>,
    )

    await renameScenario(user, 'Path A, tweaked')
    expect(showToast).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Save changes to Path A, tweaked' }))

    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith('Saved Path A, tweaked', 'success')
  })

  it('prefills the measured spend as an unsaved edit and says so in a toast', () => {
    const showToast = vi.fn()
    const plan = makeScenario({ id: 1, name: 'Path A', isActive: true, annualSpendCents: 18_000_00 })
    render(
      <ToastContext.Provider value={{ showToast }}>
        <GoalsTab
          model={buildExpenseModel(makeDataset({ goalScenarios: [plan] }))}
          actions={makeActions()}
          entry={{ kind: 'baseline', monthlyCents: 2_000_00 }}
        />
      </ToastContext.Provider>,
    )

    expect(screen.getByLabelText('Unsaved changes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save changes to Path A/ })).toBeInTheDocument()
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith(
      'Annual spend at FI set to 24.000,00 € from your measured spending. Save to keep it.',
    )
  })

  it('treats a colour change as an unsaved edit and saves it with the rest', async () => {
    const user = userEvent.setup()
    const actions = makeActions()
    const plan = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true, color: '#6366f1' })
    const model = buildExpenseModel(makeDataset({ goalScenarios: [plan] }))
    render(<GoalsTab model={model} actions={actions} />)

    await openScenarioMenu(user)
    await user.click(screen.getByRole('button', { name: 'Use color #10b981' }))
    await user.keyboard('{Escape}')
    expect(actions.updateScenario).not.toHaveBeenCalled()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save changes to Path A' }))
    expect(actions.updateScenario).toHaveBeenCalledWith(1, expect.objectContaining({ color: '#10b981' }))
  })

  it('asks before a tab switch drops the edits of a detached draft too', async () => {
    const user = userEvent.setup()
    const plan = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true })
    const other = makeScenario({ id: 2, name: 'Path B', sortOrder: 1 })
    const model = buildExpenseModel(makeDataset({ goalScenarios: [plan, other] }))
    render(<GoalsTab model={model} actions={makeActions()} />)

    await renameScenario(user, 'Path A, tweaked')
    // Detaching keeps the edits, and with no saved scenario loaded nothing tracks them as unsaved.
    await openScenarioMenu(user)
    await user.click(screen.getByRole('button', { name: 'Keep these edits as a draft' }))
    expect(scenarioTab('Unsaved draft', true)).toBeInTheDocument()
    await user.click(scenarioTab('Path B'))

    expect(screen.getByText('Discard the unsaved draft?')).toBeInTheDocument()
    expect(scenarioTab('Unsaved draft', true)).toBeInTheDocument()

    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Discard' }))
    expect(scenarioTab('Path B', true)).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Unsaved draft' })).not.toBeInTheDocument()
  })

  it('switches tabs without asking when nothing is unsaved', async () => {
    const user = userEvent.setup()
    const plan = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true })
    const other = makeScenario({ id: 2, name: 'Path B', sortOrder: 1 })
    const model = buildExpenseModel(makeDataset({ goalScenarios: [plan, other] }))
    render(<GoalsTab model={model} actions={makeActions()} />)

    await user.click(scenarioTab('Path B'))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(scenarioTab('Path B', true)).toBeInTheDocument()
  })

  it('measures Progress against the plan, not the scenario loaded in the editor', async () => {
    const user = userEvent.setup()
    const account = makeWealthAccount({ id: 1, kind: 'investment' })
    const plan = makeScenario({
      id: 1,
      name: 'Path A',
      sortOrder: 0,
      isActive: true,
      planStartDate: '2024-01-01',
      startInvestedCents: 100_000_000,
      monthlyContributionCents: 100_000,
    })
    const other = makeScenario({ id: 2, name: 'Path B', sortOrder: 1, planStartDate: '2024-01-01' })
    const checkin = makeWealthCheckin({
      id: 1,
      checkinDate: '2024-07-01',
      entries: [{ accountId: 1, valueCents: 1_000 }],
    })
    const model = buildExpenseModel(
      makeDataset({
        goalScenarios: [plan, other],
        wealthAccounts: [account],
        wealthCheckins: [checkin],
      }),
    )
    render(<GoalsTab model={model} actions={makeActions()} />)

    // Load the other scenario into the editor, then look at Progress.
    await user.click(scenarioTab('Path B'))
    await user.click(screen.getByRole('tab', { name: 'Progress' }))

    // Against Path A's 100M start the tiny check-in is far behind; against Path B's
    // 10M start it would still be behind, but the delta names the plan's number.
    expect(screen.getByText(/behind plan/i)).toBeInTheDocument()
    expect(screen.getByText(/measured against Path A/i)).toBeInTheDocument()
  })

  it('keeps the three-way switch on wide screens, where Plan shows the chart and the controls together', () => {
    render(<GoalsTab model={makeModel()} />)

    expect(screen.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('tab', { name: 'Chart' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Scenarios' })).not.toBeInTheDocument()
  })

  it('swaps the switch when the window crosses the breakpoint, keeping the view and the half of Plan', async () => {
    mockPhoneWidth()
    const user = userEvent.setup()
    render(<GoalsTab model={makeModel()} />)
    const labels = () =>
      within(screen.getByRole('tablist', { name: 'Goals view' }))
        .getAllByRole('tab')
        .map((r) => r.textContent)
    const widen = (wide: boolean) => act(() => media.change(NARROW_MQ, !wide))

    await user.click(screen.getByRole('tab', { name: 'Scenarios' }))
    widen(true)
    expect(labels()).toEqual(['Plan', 'Progress', 'Assumptions'])
    expect(screen.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true')

    widen(false)
    expect(labels()).toEqual(['Chart', 'Progress', 'Scenarios', 'Assumptions'])
    expect(screen.getByRole('tab', { name: 'Scenarios' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('tab', { name: 'Progress' }))
    widen(true)
    expect(screen.getByRole('tab', { name: 'Progress' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Progress snapshot')).toBeInTheDocument()
  })

  it('asks for the toast to go in the side rail while the wide Plan is shown, and not on a phone or another view', async () => {
    const asked = () => document.documentElement.hasAttribute('data-toast-aside')
    const user = userEvent.setup()
    const wide = render(<GoalsTab model={makeModel()} />)
    expect(asked()).toBe(true)

    await user.click(screen.getByRole('tab', { name: 'Progress' }))
    expect(asked()).toBe(false)
    wide.unmount()

    mockPhoneWidth()
    render(<GoalsTab model={makeModel()} />)
    expect(asked()).toBe(false)
  })

  it('puts the view switch in the title\'s own row on a wide screen, and under it on a phone', () => {
    const { unmount } = render(<GoalsTab model={makeModel()} />)
    const title = screen.getByRole('heading', { name: 'Goals' })
    // One row, so the page spends one line, not two, above the chart.
    expect(title.parentElement).toContainElement(screen.getByRole('tablist', { name: 'Goals view' }))
    unmount()

    mockPhoneWidth()
    render(<GoalsTab model={makeModel()} />)
    expect(screen.getByRole('heading', { name: 'Goals' }).parentElement).not.toContainElement(
      screen.getByRole('tablist', { name: 'Goals view' }),
    )
  })

  describe('the hero card', () => {
    it('has the display switch in its header and a line for FI and the milestone on a wide screen, with no summary box', () => {
      render(<GoalsTab model={makeModel()} />)
      const header = screen.getByRole('heading', { name: 'Invested portfolio projection' }).parentElement!

      // Beside the window buttons, where it is always in sight, not at the foot of the card.
      expect(within(header).getByRole('radiogroup', { name: 'Value display mode' })).toBeInTheDocument()
      expect(screen.queryByText('Scenario summary')).not.toBeInTheDocument()
      // The net worth the box also gave is the levers bar's now, so it is not said twice.
      expect(screen.getAllByText(/^Net worth in 30 yrs$/)).toHaveLength(1)
    })

    it('says in a line when the plan reaches financial independence and its next milestone, and nothing when it reaches neither', () => {
      const reaches = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true, annualSpendCents: 100_000 })
      const { unmount } = render(<GoalsTab model={buildExpenseModel(makeDataset({ goalScenarios: [reaches] }))} />)
      expect(screen.getByText('Financial independence').closest('p')).toHaveTextContent('Financial independence Year 0')
      unmount()

      const never = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true, annualSpendCents: 900_000_000_000 })
      const dataset = makeDataset({ goalScenarios: [never] })
      dataset.settings = { ...dataset.settings, milestones: [] }
      render(<GoalsTab model={buildExpenseModel(dataset)} />)
      expect(screen.queryByText('Financial independence')).not.toBeInTheDocument()
    })

    it('says in a line when the plan crosses its next milestone', () => {
      const dataset = makeDataset({
        goalScenarios: [makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true, startInvestedCents: 100_000, monthlyContributionCents: 100_000 })],
      })
      dataset.settings = { ...dataset.settings, milestones: [{ amountCents: 50_000_000, label: 'Coast FI' }] }
      render(<GoalsTab model={buildExpenseModel(dataset)} />)

      expect(screen.getByText(/Coast FI .* invested/).closest('p')).toHaveTextContent(/Year \d+/)
    })

    it('explains the purchase years and the band once, under the legend, and not above the chart', () => {
      render(<GoalsTab model={makeModel()} />)

      expect(screen.queryByText(/select a year on the chart for values/)).not.toBeInTheDocument()
      const note = screen.getByText(/Dashed vertical lines mark purchase years/)
      // The 5% a new plan starts at, three points either side.
      expect(note).toHaveTextContent('The shaded band is the line you are editing at a real return of 2,0% to 8,0%, three points either side. It shows how much the return matters, not how likely an outcome is.')
      expect(note).toHaveTextContent('return and contributions apply before the down payment comes out')
    })

    it('keeps the summary box, the switch under it and the explanation above the chart on a phone', () => {
      mockPhoneWidth()
      render(<GoalsTab model={makeModel()} />)

      expect(screen.getByText('Scenario summary')).toBeInTheDocument()
      const header = screen.getByRole('heading', { name: 'Invested portfolio projection' }).parentElement!
      expect(within(header).queryByRole('radiogroup', { name: 'Value display mode' })).not.toBeInTheDocument()
      expect(screen.getByRole('radiogroup', { name: 'Value display mode' })).toBeInTheDocument()
      expect(screen.getByText(/select a year on the chart for values/)).toBeInTheDocument()
      expect(screen.queryByText(/The shaded band is the line you are editing/)).not.toBeInTheDocument()
      expect(screen.getByText(/The shaded band is the edited plan at a return three points lower and higher/)).toBeInTheDocument()
    })

    it('says what is flat and what rises in the Nominal view', async () => {
      const user = userEvent.setup()
      render(<GoalsTab model={makeModel()} />)

      await user.click(screen.getByRole('radio', { name: 'Nominal' }))

      expect(screen.getByText(/Milestones are amounts on your account, so they stay put in this view/)).toBeInTheDocument()
      expect(screen.getByText(/the FI target is in today's money, so it rises with the inflation/)).toBeInTheDocument()
    })
  })

  it('has one row of four views on a phone, opening on Chart', () => {
    mockPhoneWidth()
    const { container } = render(<GoalsTab model={makeModel()} />)

    const row = screen.getByRole('tablist', { name: 'Goals view' })
    expect(within(row).getAllByRole('tab').map((r) => r.textContent)).toEqual([
      'Chart',
      'Progress',
      'Scenarios',
      'Assumptions',
    ])
    expect(screen.queryByRole('tab', { name: 'Plan' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Chart' })).toHaveAttribute('aria-selected', 'true')
    expect(container.querySelector('[data-mobile-view="chart"]')).not.toBeNull()
  })

  it('switches to the Scenarios panel from the phone row', async () => {
    mockPhoneWidth()
    const user = userEvent.setup()
    const { container } = render(<GoalsTab model={makeModel()} />)

    await user.click(screen.getByRole('tab', { name: 'Scenarios' }))

    expect(screen.getByRole('tab', { name: 'Scenarios' })).toHaveAttribute('aria-selected', 'true')
    expect(container.querySelector('[data-mobile-view="adjust"]')).not.toBeNull()
    expect(container.querySelector('[data-mobile-view="chart"]')).toBeNull()
  })

  it('makes one copy for a double tap on the phone\'s Duplicate, and holds the button while it is made', async () => {
    mockPhoneWidth()
    const user = userEvent.setup()
    let land!: () => void
    const actions = makeActions()
    vi.mocked(actions.createScenario).mockImplementation(
      () =>
        new Promise((resolve) => {
          land = () => resolve(makeScenario({ id: 1, name: 'Path A' }))
        }),
    )
    const dataset = makeDataset()
    dataset.goalScenarios = [makeScenario({ id: 1, name: 'Path A', isActive: true })]
    render(<GoalsTab model={buildExpenseModel(dataset)} actions={actions} />)
    await user.click(screen.getByRole('tab', { name: 'Scenarios' }))
    const button = screen.getByRole('button', { name: 'Duplicate' })

    await user.dblClick(button)

    expect(actions.createScenario).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
    await act(async () => {
      land()
      await Promise.resolve()
    })
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeEnabled()
  })

  it('reaches Progress and Assumptions from the phone row, and comes back to the half of Plan it left', async () => {
    mockPhoneWidth()
    const user = userEvent.setup()
    const { container } = render(<GoalsTab model={makeModel()} />)

    await user.click(screen.getByRole('tab', { name: 'Scenarios' }))
    await user.click(screen.getByRole('tab', { name: 'Progress' }))
    expect(screen.getByText('Progress snapshot')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Scenarios' })).toHaveAttribute('aria-selected', 'false')
    expect(container.querySelector('[data-mobile-view]')).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Assumptions' }))
    expect(screen.getByRole('tab', { name: 'Assumptions' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('tab', { name: 'Scenarios' }))
    expect(screen.getByRole('tab', { name: 'Scenarios' })).toHaveAttribute('aria-selected', 'true')
    expect(container.querySelector('[data-mobile-view="adjust"]')).not.toBeNull()
  })

  it('keeps the inflation preview while moving between Chart and Scenarios, as the old toggle did', async () => {
    mockPhoneWidth()
    const user = userEvent.setup()
    render(<GoalsTab model={makeModel()} actions={makeActions()} />)
    await user.click(screen.getByRole('radio', { name: 'Nominal' }))
    stepPreviewUp()

    await user.click(screen.getByRole('tab', { name: 'Scenarios' }))
    await user.click(screen.getByRole('tab', { name: 'Chart' }))

    expect(screen.getByLabelText('Preview inflation')).toHaveValue('2,5')
  })

  it('pins the section chips with the chart in Scenarios, and shows them nowhere else', async () => {
    mockPhoneWidth()
    const user = userEvent.setup()
    render(<GoalsTab model={makeModel()} />)
    // Hidden from the accessibility tree outside the phone breakpoint, which jsdom cannot match.
    const chips = () => screen.queryByRole('navigation', { name: 'Scenario sections', hidden: true })

    expect(chips()).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Scenarios' }))

    expect(chips()).toBeInTheDocument()
    expect(document.getElementById('goals-adjust-stack')).toContainElement(chips())
    expect(document.getElementById('goals-adjust-housing')).toBeInTheDocument()
    await vi.waitFor(() => expect(scrollBy).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('tab', { name: 'Chart' }))
    expect(chips()).not.toBeInTheDocument()
  })

  it('saves or drops edits to a saved scenario from the Scenarios section row', async () => {
    mockPhoneWidth()
    const user = userEvent.setup()
    const actions = makeActions()
    const plan = makeScenario({ id: 1, name: 'Path A', isActive: true })
    render(<GoalsTab model={buildExpenseModel(makeDataset({ goalScenarios: [plan] }))} actions={actions} />)
    await user.click(screen.getByRole('tab', { name: 'Scenarios' }))
    const row = () => screen.queryByRole('group', { name: 'Unsaved changes', hidden: true })
    const button = (name: string) =>
      within(row()!).getByRole('button', { name, hidden: true })

    expect(row()).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Scenario name'), { target: { value: 'Path A, tweaked' } })
    // The scenario card has a Save changes and a Discard of its own, so the row's say whose they are.
    expect(screen.getByRole('button', { name: 'Save changes', hidden: true })).not.toBe(button('Save changes to Path A, tweaked'))
    expect(screen.getByRole('button', { name: 'Discard', hidden: true })).not.toBe(button('Discard changes'))
    await user.click(button('Save changes to Path A, tweaked'))
    expect(actions.updateScenario).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Path A, tweaked' }))

    await user.click(button('Discard changes'))
    expect(screen.getByLabelText('Scenario name')).toHaveValue('Path A')
    expect(row()).not.toBeInTheDocument()
  })

  it('holds Save and Discard in the row and the card while a save is in flight, so the editor cannot be put back under it', async () => {
    mockPhoneWidth()
    const user = userEvent.setup()
    const actions = makeActions()
    let finish!: () => void
    vi.mocked(actions.updateScenario).mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    const plan = makeScenario({ id: 1, name: 'Path A', isActive: true })
    render(<GoalsTab model={buildExpenseModel(makeDataset({ goalScenarios: [plan] }))} actions={actions} />)
    await user.click(screen.getByRole('tab', { name: 'Scenarios' }))
    fireEvent.change(screen.getByLabelText('Scenario name'), { target: { value: 'Path A, tweaked' } })
    const button = (name: string) => screen.getByRole('button', { name, hidden: true })
    const held = ['Save changes to Path A, tweaked', 'Discard changes', 'Save changes', 'Discard']

    await user.click(button('Save changes to Path A, tweaked'))
    for (const name of held) expect(button(name)).toBeDisabled()
    await user.click(button('Save changes to Path A, tweaked'))
    await user.click(button('Discard changes'))
    await user.click(button('Discard'))

    expect(actions.updateScenario).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Scenario name')).toHaveValue('Path A, tweaked')

    await act(async () => {
      finish()
      await Promise.resolve()
    })
    for (const name of held) expect(button(name)).toBeEnabled()
  })

  it('puts focus on the marked chip when Enter on Save sends the row away, not on the page', async () => {
    mockPhoneWidth()
    const user = userEvent.setup()
    const actions = makeActions()
    const plan = makeScenario({ id: 1, name: 'Path A', isActive: true })
    const dataset = makeDataset({ goalScenarios: [plan] })
    const { rerender } = render(<GoalsTab model={buildExpenseModel(dataset)} actions={actions} />)
    await user.click(screen.getByRole('tab', { name: 'Scenarios' }))
    fireEvent.change(screen.getByLabelText('Scenario name'), { target: { value: 'Path A, tweaked' } })
    screen.getByRole('button', { name: 'Save changes to Path A, tweaked', hidden: true }).focus()

    await user.keyboard('{Enter}')
    // The write lands and the dataset refreshes, so nothing is unsaved any more.
    rerender(
      <GoalsTab
        model={buildExpenseModel({ ...dataset, goalScenarios: [{ ...plan, name: 'Path A, tweaked' }] })}
        actions={actions}
      />,
    )

    expect(screen.queryByRole('group', { name: 'Unsaved changes', hidden: true })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { current: true, hidden: true })).toHaveFocus()
  })

  it('offers no Save in a read-only session, which cannot save, even once a control has been edited', async () => {
    mockPhoneWidth()
    const user = userEvent.setup()
    const plan = makeScenario({ id: 1, name: 'Path A', isActive: true })
    render(<GoalsTab model={buildExpenseModel(makeDataset({ goalScenarios: [plan] }))} />)
    await user.click(screen.getByRole('tab', { name: 'Scenarios' }))
    const field = screen.getByLabelText('Monthly investing')
    const before = (field as HTMLInputElement).value

    // The controls take edits in any session, and the draft then differs from the saved plan.
    fireEvent.change(field, { target: { value: '12345' } })
    fireEvent.blur(field)

    expect((field as HTMLInputElement).value).not.toBe(before)
    expect(screen.queryByRole('group', { name: 'Unsaved changes', hidden: true })).not.toBeInTheDocument()
  })

  it('leads the outputs with the projection chart on a wide screen, ahead of the snapshot and the detail charts', () => {
    render(<GoalsTab model={makeModel()} />)
    const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    const chart = screen.getByRole('heading', { name: 'Invested portfolio projection' })

    expect(before(chart, screen.getByText('Where you are today'))).toBe(true)
    expect(before(chart, screen.getByText('Net worth composition'))).toBe(true)
  })

  it('starts the scroll target straight after the switch, ahead of everything Plan and Progress show', async () => {
    const user = userEvent.setup()
    render(<GoalsTab model={makeModel()} />)
    const anchor = () => document.getElementById('goals-content-top')!
    const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

    expect(before(anchor(), screen.getByLabelText('Monthly investing'))).toBe(true)
    expect(before(anchor(), screen.getByRole('heading', { name: 'Invested portfolio projection' }))).toBe(true)
    expect(before(anchor(), screen.getByText('What do these terms mean?'))).toBe(true)

    await user.click(screen.getByRole('tab', { name: 'Progress' }))
    expect(screen.queryByText('What do these terms mean?')).not.toBeInTheDocument()
    expect(before(anchor(), screen.getByText('Progress snapshot'))).toBe(true)
  })

  it('pins a compact chart of the draft above the controls in the Scenarios panel only', async () => {
    mockPhoneWidth()
    const user = userEvent.setup()
    const { container } = render(<GoalsTab model={makeModel()} />)
    // The block is display:none outside the phone breakpoint, which jsdom cannot match, so
    // this asks the DOM rather than the accessibility tree.
    const mini = () =>
      container.querySelector('svg[aria-label^="Projection of the scenario being edited"]')

    expect(mini()).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Scenarios' }))
    expect(mini()).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Chart' }))
    expect(mini()).not.toBeInTheDocument()
  })

  it('drops the pinned chart and chips when the window is widened from phone Scenarios to desktop', async () => {
    mockPhoneWidth()
    const user = userEvent.setup()
    render(<GoalsTab model={makeModel()} />)
    await user.click(screen.getByRole('tab', { name: 'Scenarios' }))
    expect(document.getElementById('goals-adjust-stack')).toBeInTheDocument()

    act(() => media.change(NARROW_MQ, false))

    expect(document.getElementById('goals-adjust-stack')).not.toBeInTheDocument()
  })

  it('offers a preview of the inflation in the Nominal view only, and the setting itself in Assumptions only', async () => {
    const user = userEvent.setup()
    render(<GoalsTab model={makeModel()} actions={makeActions()} />)

    // Purchasing power is already today's money, and the saved rate belongs to Assumptions, so
    // there is nothing to preview there.
    expect(screen.queryByLabelText('Preview inflation')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Assumed inflation')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Nominal' }))
    expect(screen.getByLabelText('Preview inflation')).toHaveValue('2,0')
    expect(screen.queryByLabelText('Assumed inflation')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Progress' }))
    expect(screen.queryByLabelText('Preview inflation')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Assumed inflation')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Assumptions' }))
    expect(screen.getByLabelText('Assumed inflation')).toBeInTheDocument()
    expect(screen.queryByLabelText('Preview inflation')).not.toBeInTheDocument()
  })

  it('says the preview is not saved, what the rest of Goals uses, and where to change it', async () => {
    const user = userEvent.setup()
    render(<GoalsTab model={makeModel()} actions={makeActions()} />)
    await user.click(screen.getByRole('radio', { name: 'Nominal' }))

    // One paragraph: what is flat and what rises in this view, and that the preview is not saved.
    const note = screen.getByText(/The preview is not saved/)
    expect(note).toHaveTextContent(/the rest of Goals uses the saved 2,0%, which you change in Assumptions/)
    expect(note).toHaveTextContent(/Milestones are amounts on your account, so they stay put in this view/)
  })

  it('previews without saving, and Progress and the saved rate stay where they were', async () => {
    const user = userEvent.setup()
    const actions = makeActions()
    const plan = makeScenario({ id: 1, name: 'Path A', isActive: true, planStartDate: '2025-01-01' })
    const accounts = [makeWealthAccount({ id: 1, name: 'Broker', kind: 'investment' })]
    const behind = (id: number, date: string) =>
      makeWealthCheckin({
        id,
        checkinDate: date,
        entries: [{ accountId: 1, valueCents: planValueAtDate(plan, date, DEFAULT_INFLATION_RATE)! - 50_000_00 }],
      })
    const dataset = makeDataset({
      goalScenarios: [plan],
      wealthAccounts: accounts,
      wealthCheckins: [behind(1, '2026-01-01'), behind(2, '2026-04-01'), behind(3, '2026-07-15')],
    })
    render(<GoalsTab model={buildExpenseModel(dataset)} actions={actions} />)
    await user.click(screen.getByRole('tab', { name: 'Progress' }))
    const before = screen.getByText(/Behind plan/).textContent

    await user.click(screen.getByRole('tab', { name: 'Plan' }))
    await user.click(screen.getByRole('radio', { name: 'Nominal' }))
    fireEvent.change(screen.getByLabelText('Preview inflation'), { target: { value: '5' } })
    fireEvent.blur(screen.getByLabelText('Preview inflation'))
    expect(screen.getByLabelText('Preview inflation')).toHaveValue('5,0')

    expect(actions.updateSettings).not.toHaveBeenCalled()
    await user.click(screen.getByRole('tab', { name: 'Progress' }))
    expect(screen.getByText(/Behind plan/).textContent).toBe(before)
    await user.click(screen.getByRole('tab', { name: 'Assumptions' }))
    expect(screen.getByLabelText('Assumed inflation')).toHaveValue('2,0')
  })

  it('offers Reset once the preview differs from the saved rate, and it goes back to it', async () => {
    const user = userEvent.setup()
    render(<GoalsTab model={makeModel()} actions={makeActions()} />)
    await user.click(screen.getByRole('radio', { name: 'Nominal' }))
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()

    stepPreviewUp()
    expect(screen.getByLabelText('Preview inflation')).toHaveValue('2,5')
    await user.click(screen.getByRole('button', { name: 'Reset' }))

    expect(screen.getByLabelText('Preview inflation')).toHaveValue('2,0')
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()
  })

  it('drops the preview when leaving the Nominal view or the Plan view', async () => {
    const user = userEvent.setup()
    render(<GoalsTab model={makeModel()} actions={makeActions()} />)
    const bump = async () => {
      await user.click(screen.getByRole('radio', { name: 'Nominal' }))
      stepPreviewUp()
      expect(screen.getByLabelText('Preview inflation')).toHaveValue('2,5')
    }

    await bump()
    await user.click(screen.getByRole('radio', { name: 'Purchasing power' }))
    await user.click(screen.getByRole('radio', { name: 'Nominal' }))
    expect(screen.getByLabelText('Preview inflation')).toHaveValue('2,0')

    await bump()
    await user.click(screen.getByRole('tab', { name: 'Progress' }))
    await user.click(screen.getByRole('tab', { name: 'Plan' }))
    expect(screen.getByLabelText('Preview inflation')).toHaveValue('2,0')
  })

  it('starts the preview from the saved rate', async () => {
    const user = userEvent.setup()
    const model = buildExpenseModel(
      makeDataset({ settings: { ...defaultExpenseSettings(), assumedInflation: 0.04 } }),
    )
    render(<GoalsTab model={model} actions={makeActions()} />)
    await user.click(screen.getByRole('radio', { name: 'Nominal' }))

    expect(screen.getByLabelText('Preview inflation')).toHaveValue('4,0')
    expect(screen.getByText(/the rest of Goals uses the saved 4,0%/)).toBeInTheDocument()
  })

  it('opens Assumptions on the assumed inflation from the Nominal note, and only from there', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(<GoalsTab model={makeModel()} actions={makeActions()} />)

    await user.click(screen.getByRole('radio', { name: 'Nominal' }))
    await user.click(screen.getByRole('button', { name: 'Open Assumptions' }))

    expect(screen.getByRole('tab', { name: 'Assumptions' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Assumed inflation')).toBeInTheDocument()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    // Coming back to Assumptions by the switcher is not a request to scroll to it.
    await user.click(screen.getByRole('tab', { name: 'Plan' }))
    await user.click(screen.getByRole('tab', { name: 'Assumptions' }))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  describe('coming back to a view', () => {
    let scrollY: MockInstance
    let scrollTo: MockInstance
    beforeEach(() => {
      mockPhoneWidth()
      scrollY = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(0)
      scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    })

    it('goes back to where the chart was when a link, not the row, took the viewer away', async () => {
      const user = userEvent.setup()
      render(<GoalsTab model={makeModel()} actions={makeActions()} />)
      scrollY.mockReturnValue(700)
      await user.click(screen.getByRole('tab', { name: 'Progress' }))
      await user.click(screen.getByRole('tab', { name: 'Chart' }))
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 700, behavior: 'auto' })

      await user.click(screen.getByRole('radio', { name: 'Nominal' }))
      scrollY.mockReturnValue(1360)
      await user.click(screen.getByRole('button', { name: 'Open Assumptions' }))
      scrollY.mockReturnValue(40)
      await user.click(screen.getByRole('tab', { name: 'Chart' }))

      expect(scrollTo).toHaveBeenLastCalledWith({ top: 1360, behavior: 'auto' })
    })

    it('keeps a place for each half of Plan, though moving between them is not a change of view', async () => {
      const user = userEvent.setup()
      render(<GoalsTab model={makeModel()} actions={makeActions()} />)
      scrollY.mockReturnValue(300)
      await user.click(screen.getByRole('tab', { name: 'Scenarios' }))
      scrollY.mockReturnValue(2000)
      await user.click(screen.getByRole('tab', { name: 'Chart' }))
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 300, behavior: 'auto' })

      scrollY.mockReturnValue(300)
      await user.click(screen.getByRole('tab', { name: 'Scenarios' }))

      expect(scrollTo).toHaveBeenLastCalledWith({ top: 2000, behavior: 'auto' })
    })

    it('opens the Scenario sections that were showing before it scrolls back, as Plan unmounts them', async () => {
      const user = userEvent.setup()
      render(<GoalsTab model={makeModel()} actions={makeActions()} />)
      await user.click(screen.getByRole('tab', { name: 'Scenarios' }))
      const events = document.getElementById('goals-adjust-events')
      if (!(events instanceof HTMLDetailsElement)) throw new Error('no events section')
      events.open = true
      scrollY.mockReturnValue(2125)
      await user.click(screen.getByRole('tab', { name: 'Progress' }))
      let openWhenScrolled: boolean | null = null
      scrollTo.mockImplementation(() => {
        const back = document.getElementById('goals-adjust-events')
        openWhenScrolled = back instanceof HTMLDetailsElement ? back.open : null
      })
      // The frame comes after the controls have been rendered again, as in a browser.
      const frames: FrameRequestCallback[] = []
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))

      await user.click(screen.getByRole('tab', { name: 'Scenarios' }))
      frames.forEach((cb) => cb(0))

      expect(scrollTo).toHaveBeenLastCalledWith({ top: 2125, behavior: 'auto' })
      expect(openWhenScrolled).toBe(true)
    })

    it('goes back to where Progress was when its own link took the viewer to Assumptions', async () => {
      const user = userEvent.setup()
      render(<GoalsTab model={makeModel()} actions={makeActions()} />)
      await user.click(screen.getByRole('tab', { name: 'Progress' }))
      scrollY.mockReturnValue(900)
      await user.click(screen.getByRole('button', { name: 'Set up accounts' }))
      scrollY.mockReturnValue(40)
      await user.click(screen.getByRole('tab', { name: 'Progress' }))

      expect(scrollTo).toHaveBeenLastCalledWith({ top: 900, behavior: 'auto' })
    })

    it('forgets where views were left once the window has been widened and narrowed again', async () => {
      const user = userEvent.setup()
      render(<GoalsTab model={makeModel()} actions={makeActions()} />)
      scrollY.mockReturnValue(700)
      await user.click(screen.getByRole('tab', { name: 'Progress' }))
      scrollTo.mockClear()

      act(() => media.change(NARROW_MQ, false))
      act(() => media.change(NARROW_MQ, true))
      await user.click(screen.getByRole('tab', { name: 'Chart' }))

      expect(scrollTo).not.toHaveBeenCalled()
    })
  })

  it('saves the assumed inflation as a setting when it is changed in Assumptions', async () => {
    const user = userEvent.setup()
    const actions = makeActions()
    render(<GoalsTab model={makeModel()} actions={actions} />)
    await user.click(screen.getByRole('tab', { name: 'Assumptions' }))
    const input = screen.getByLabelText('Assumed inflation')
    expect(input).toHaveValue('2,0')

    fireEvent.change(input, { target: { value: '3' } })
    fireEvent.blur(input)

    expect(actions.updateSettings).toHaveBeenCalledWith({ assumedInflation: 0.03 })
  })

  it('previews in a read-only session too, with no link to an Assumptions view that cannot be changed', async () => {
    const user = userEvent.setup()
    render(<GoalsTab model={makeModel()} />)
    await user.click(screen.getByRole('radio', { name: 'Nominal' }))

    stepPreviewUp()
    expect(screen.getByLabelText('Preview inflation')).toHaveValue('2,5')
    expect(screen.getByText(/the rest of Goals uses the saved 2,0%\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open Assumptions' })).not.toBeInTheDocument()
    expect(screen.queryByText(/which you change in Assumptions/)).not.toBeInTheDocument()
  })
})
