import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { GoalsTab } from './GoalsTab'
import { buildExpenseModel } from '../../buildExpenseModel'
import { makeDataset, makeScenario, makeWealthAccount, makeWealthCheckin } from '../../../testing/factories'
import { makeActions } from '../../../testing/makeActions'
import { defaultExpenseSettings } from '../../../engine'

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
    expect(screen.getByText('Your plan')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use as my plan' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Path B' }))
    await user.click(screen.getByRole('button', { name: 'Use as my plan' }))

    expect(actions.activateScenario).toHaveBeenCalledWith(2)
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
