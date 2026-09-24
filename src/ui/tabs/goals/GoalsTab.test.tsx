import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { GoalsTab } from './GoalsTab'
import { buildExpenseModel } from '../../buildExpenseModel'
import { makeDataset, makeScenario, makeWealthAccount, makeWealthCheckin } from '../../../testing/factories'
import { makeActions } from '../../../testing/makeActions'
import { defaultExpenseSettings, planValueAtDate } from '../../../engine'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

function makeModel() {
  return buildExpenseModel(makeDataset())
}

describe('GoalsTab', () => {
  it('renders with Plan view by default', () => {
    render(<GoalsTab model={makeModel()} />)
    expect(screen.getByRole('radio', { name: 'Plan' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Progress' })).toBeInTheDocument()
  })

  it('switches to Progress view when Progress tab is selected', async () => {
    const user = userEvent.setup()
    render(<GoalsTab model={makeModel()} />)

    await user.click(screen.getByRole('radio', { name: 'Progress' }))

    expect(screen.getByText('Progress snapshot')).toBeInTheDocument()
  })

  it('keeps milestones and accounts in Setup, out of Progress', async () => {
    const user = userEvent.setup()
    const model = buildExpenseModel(
      makeDataset({ wealthAccounts: [makeWealthAccount({ id: 1, name: 'Broker' })] }),
    )
    render(<GoalsTab model={model} actions={makeActions()} />)

    await user.click(screen.getByRole('radio', { name: 'Progress' }))
    expect(screen.getByText('Progress snapshot')).toBeInTheDocument()
    expect(screen.queryByText('Wealth accounts')).not.toBeInTheDocument()
    expect(screen.queryByText('Milestones')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Setup' }))
    expect(screen.getByText('Wealth accounts')).toBeInTheDocument()
    expect(screen.getByText('Milestones')).toBeInTheDocument()
    expect(screen.getByText('Broker')).toBeInTheDocument()
    expect(screen.queryByText('Progress snapshot')).not.toBeInTheDocument()
  })

  it('writes milestone edits made in Setup to settings', async () => {
    const user = userEvent.setup()
    const actions = makeActions()
    render(<GoalsTab model={makeModel()} actions={actions} />)

    await user.click(screen.getByRole('radio', { name: 'Setup' }))
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

    expect(screen.getByRole('radio', { name: 'Progress' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Save check-in' })).toBeInTheDocument()
  })

  it('opens the check-in form once, not again after a trip to Plan and back', async () => {
    const user = userEvent.setup()
    const model = buildExpenseModel(
      makeDataset({ wealthAccounts: [makeWealthAccount({ id: 1, name: 'Broker' })] }),
    )
    render(<GoalsTab model={model} actions={makeActions()} entry="checkin" />)
    expect(screen.getByRole('button', { name: 'Save check-in' })).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Plan' }))
    await user.click(screen.getByRole('radio', { name: 'Progress' }))
    expect(screen.queryByRole('button', { name: 'Save check-in' })).not.toBeInTheDocument()
  })

  it('shows a hidden scenario again when it is loaded for editing', async () => {
    const user = userEvent.setup()
    const plan = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true })
    const other = makeScenario({ id: 2, name: 'Path B', sortOrder: 1 })
    const model = buildExpenseModel(makeDataset({ goalScenarios: [plan, other] }))
    render(<GoalsTab model={model} actions={makeActions()} />)

    await user.click(screen.getAllByRole('button', { name: 'Hide Path B on chart' })[0]!)
    expect(screen.getAllByRole('button', { name: 'Show Path B on chart' })).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: /^Path B$/ }))
    expect(screen.queryByRole('button', { name: 'Show Path B on chart' })).not.toBeInTheDocument()
  })

  it('hides a scenario from the hero legend and the chip agrees', async () => {
    const user = userEvent.setup()
    const plan = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true })
    const other = makeScenario({ id: 2, name: 'Path B', sortOrder: 1 })
    const model = buildExpenseModel(makeDataset({ goalScenarios: [plan, other] }))
    render(<GoalsTab model={model} actions={makeActions()} />)

    // The chip's eye comes first in the DOM; the legend row is the second control.
    const toggles = screen.getAllByRole('button', { name: 'Hide Path B on chart' })
    expect(toggles).toHaveLength(2)
    await user.click(toggles[1]!)

    // Both the legend row and the chip's eye now offer to show it again.
    expect(screen.getAllByRole('button', { name: 'Show Path B on chart' })).toHaveLength(2)
  })

  it('takes an empty Progress view to Setup', async () => {
    const user = userEvent.setup()
    render(<GoalsTab model={makeModel()} actions={makeActions()} />)

    await user.click(screen.getByRole('radio', { name: 'Progress' }))
    await user.click(screen.getByRole('button', { name: 'Set up accounts' }))

    expect(screen.getByRole('radio', { name: 'Setup' })).toBeChecked()
    expect(screen.getByText('Wealth accounts')).toBeInTheDocument()
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
    expect(screen.getAllByText('Current plan').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Use as my plan' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Path B' }))
    await user.click(screen.getByRole('button', { name: 'Use as my plan' }))

    expect(actions.activateScenario).toHaveBeenCalledWith(2)
  })

  it('asks before a chip switch drops unsaved edits, and keeps them on Cancel', async () => {
    const user = userEvent.setup()
    const plan = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true })
    const other = makeScenario({ id: 2, name: 'Path B', sortOrder: 1 })
    const model = buildExpenseModel(makeDataset({ goalScenarios: [plan, other] }))
    render(<GoalsTab model={model} actions={makeActions()} />)

    const name = screen.getByLabelText('Scenario name')
    fireEvent.change(name, { target: { value: 'Path A, tweaked' } })
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Path B' }))
    expect(screen.getByText('Discard unsaved changes to Path A?')).toBeInTheDocument()
    expect(screen.getByLabelText('Scenario name')).toHaveValue('Path A, tweaked')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Scenario name')).toHaveValue('Path A, tweaked')

    await user.click(screen.getByRole('button', { name: 'Path B' }))
    // The header has its own Discard button; the one in the sheet is the answer.
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Discard' }))
    expect(screen.getByLabelText('Scenario name')).toHaveValue('Path B')
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
        entries: [{ accountId: 1, valueCents: planValueAtDate(plan, date)! - 50_000_00 }],
      })
    const checkins = [behind(1, '2026-01-01'), behind(2, '2026-04-01'), behind(3, '2026-07-15')]
    const dataset = makeDataset({ goalScenarios: [plan], wealthAccounts: accounts, wealthCheckins: checkins })
    const { rerender } = render(<GoalsTab model={buildExpenseModel(dataset)} actions={actions} />)

    await user.click(screen.getByRole('radio', { name: 'Progress' }))
    await user.click(screen.getByRole('button', { name: 'Re-baseline from latest check-in' }))
    // It asks first, since it writes the plan straight away.
    expect(actions.updateScenario).not.toHaveBeenCalled()
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Re-baseline' }))
    const patch = { startInvestedCents: planValueAtDate(plan, '2026-07-15')! - 50_000_00, planStartDate: '2026-07-15' }
    expect(actions.updateScenario).toHaveBeenCalledWith(1, expect.objectContaining(patch))

    // The write lands and the dataset refreshes; the draft must already agree with it,
    // or the header would offer to save the old start back over the re-baseline.
    const saved = { ...plan, ...patch }
    rerender(<GoalsTab model={buildExpenseModel({ ...dataset, goalScenarios: [saved] })} actions={actions} />)
    await user.click(screen.getByRole('radio', { name: 'Plan' }))
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
        entries: [{ accountId: 1, valueCents: planValueAtDate(plan, date)! - 50_000_00 }],
      })
    const checkins = [behind(1, '2026-01-01'), behind(2, '2026-04-01'), behind(3, '2026-07-15')]
    const model = buildExpenseModel(makeDataset({ goalScenarios: [plan], wealthAccounts: accounts, wealthCheckins: checkins }))
    render(<GoalsTab model={model} actions={actions} />)

    fireEvent.change(screen.getByLabelText('Scenario name'), { target: { value: 'Path A, tweaked' } })
    await user.click(screen.getByRole('radio', { name: 'Progress' }))
    await user.click(screen.getByRole('button', { name: 'Re-baseline from latest check-in' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Re-baseline' }))
    await user.click(screen.getByRole('radio', { name: 'Plan' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(actions.updateScenario).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({
        name: 'Path A, tweaked',
        startInvestedCents: planValueAtDate(plan, '2026-07-15')! - 50_000_00,
        planStartDate: '2026-07-15',
      }),
    )
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
        entries: [{ accountId: 1, valueCents: planValueAtDate(plan, date)! - 50_000_00 }],
      })
    const checkins = [behind(1, '2026-01-01'), behind(2, '2026-04-01'), behind(3, '2026-07-15')]
    const model = buildExpenseModel(makeDataset({ goalScenarios: [plan], wealthAccounts: accounts, wealthCheckins: checkins }))
    render(<GoalsTab model={model} actions={actions} />)

    await user.click(screen.getByRole('radio', { name: 'Progress' }))
    await user.click(screen.getByRole('button', { name: 'Re-baseline from latest check-in' }))
    const sheet = screen.getByRole('alertdialog')
    expect(sheet).toHaveTextContent(/moved 2 years earlier/)
    expect(sheet).toHaveTextContent(/Dropped, already behind the new start: Bonus/)
    await user.click(within(sheet).getByRole('button', { name: 'Cancel' }))
    expect(actions.updateScenario).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Re-baseline from latest check-in' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Re-baseline' }))
    expect(actions.updateScenario).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        planStartDate: '2026-07-15',
        lifeEvents: [{ year: 1, amountCents: -20_000_00, label: 'Car' }],
        housePurchaseYear: 2,
      }),
    )
  })

  it('treats a colour change as an unsaved edit and saves it with the rest', async () => {
    const user = userEvent.setup()
    const actions = makeActions()
    const plan = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true, color: '#6366f1' })
    const model = buildExpenseModel(makeDataset({ goalScenarios: [plan] }))
    render(<GoalsTab model={model} actions={actions} />)

    await user.click(screen.getByRole('button', { name: 'Use color #10b981' }))
    expect(actions.updateScenario).not.toHaveBeenCalled()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(actions.updateScenario).toHaveBeenCalledWith(1, expect.objectContaining({ color: '#10b981' }))
  })

  it('switches chips without asking when nothing is unsaved', async () => {
    const user = userEvent.setup()
    const plan = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true })
    const other = makeScenario({ id: 2, name: 'Path B', sortOrder: 1 })
    const model = buildExpenseModel(makeDataset({ goalScenarios: [plan, other] }))
    render(<GoalsTab model={model} actions={makeActions()} />)

    await user.click(screen.getByRole('button', { name: 'Path B' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Scenario name')).toHaveValue('Path B')
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
    await user.click(screen.getByRole('button', { name: 'Path B' }))
    await user.click(screen.getByRole('radio', { name: 'Progress' }))

    // Against Path A's 100M start the tiny check-in is far behind; against Path B's
    // 10M start it would still be behind, but the delta names the plan's number.
    expect(screen.getByText(/behind plan/i)).toBeInTheDocument()
    expect(screen.getByText(/measured against Path A/i)).toBeInTheDocument()
  })

  it('defaults the mobile Chart/Adjust toggle to Chart', () => {
    const model = buildExpenseModel(makeDataset())
    const { container } = render(<GoalsTab model={model} />)

    expect(screen.getByRole('radio', { name: 'Chart' })).toBeChecked()
    expect(container.querySelector('[data-mobile-view="chart"]')).not.toBeNull()
  })

  it('switches to the Adjust panel via the mobile Chart/Adjust toggle', async () => {
    const user = userEvent.setup()
    const model = buildExpenseModel(makeDataset())
    const { container } = render(<GoalsTab model={model} />)

    await user.click(screen.getByRole('radio', { name: 'Adjust' }))

    expect(screen.getByRole('radio', { name: 'Adjust' })).toBeChecked()
    expect(container.querySelector('[data-mobile-view="adjust"]')).not.toBeNull()
    expect(container.querySelector('[data-mobile-view="chart"]')).toBeNull()
  })

  it('pins a compact chart of the draft above the controls in the Adjust panel only', async () => {
    const user = userEvent.setup()
    const { container } = render(<GoalsTab model={makeModel()} />)
    // The block is display:none outside the phone breakpoint, which jsdom cannot match, so
    // this asks the DOM rather than the accessibility tree.
    const mini = () =>
      container.querySelector('svg[aria-label="Projection of the scenario being edited"]')

    expect(mini()).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Adjust' }))
    expect(mini()).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Chart' }))
    expect(mini()).not.toBeInTheDocument()
  })

  it('shows the inflation stepper only when Purchasing power mode is active', async () => {
    const user = userEvent.setup()
    render(<GoalsTab model={makeModel()} />)

    expect(screen.queryByLabelText('Inflation rate percentage')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Purchasing power' }))

    expect(screen.getByText('Inflation assumed')).toBeInTheDocument()
    expect(screen.getByLabelText('Inflation rate percentage')).toBeInTheDocument()
  })

  it('adjusts the inflation rate via the stepper in Purchasing power mode', async () => {
    const user = userEvent.setup()
    render(<GoalsTab model={makeModel()} />)

    await user.click(screen.getByRole('radio', { name: 'Purchasing power' }))
    const input = screen.getByLabelText('Inflation rate percentage')
    expect(input).toHaveValue('2,0')

    fireEvent.change(input, { target: { value: '3' } })
    fireEvent.blur(input)

    expect(screen.getByLabelText('Inflation rate percentage')).toHaveValue('3,0')
  })
})
