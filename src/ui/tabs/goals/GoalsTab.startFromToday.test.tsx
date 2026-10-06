import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GoalsTab } from './GoalsTab'
import { formatCheckinDate } from './checkinDate'
import { installFakeMatchMedia } from '../../../testing/fakeMatchMedia'
import { buildExpenseModel } from '../../buildExpenseModel'
import { makeDataset, makeScenario, makeWealthAccount, makeWealthCheckin } from '../../../testing/factories'
import { makeActions } from '../../../testing/makeActions'

beforeAll(() => {
  installFakeMatchMedia()
})

beforeEach(() => {
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
})

const SWITCH = { name: 'Start all scenarios from my balance today' }

const plan = makeScenario({
  id: 1,
  name: 'Path A',
  sortOrder: 0,
  isActive: true,
  planStartDate: '2026-06-25',
  startInvestedCents: 107_000_00,
  monthlyContributionCents: 1_400_00,
})
const other = makeScenario({
  id: 2,
  name: 'Path B',
  sortOrder: 1,
  planStartDate: '2026-06-26',
  startInvestedCents: 107_000_00,
  monthlyContributionCents: 2_000_00,
})
const broker = makeWealthAccount({ id: 1, name: 'Broker', kind: 'investment' })
const checkin = makeWealthCheckin({ id: 1, checkinDate: '2026-10-05', entries: [{ accountId: 1, valueCents: 138_700_00 }] })

function renderTab(overrides: Parameters<typeof makeDataset>[0] = {}, actions = makeActions()) {
  const dataset = makeDataset({
    goalScenarios: [plan, other],
    wealthAccounts: [broker],
    wealthCheckins: [checkin],
    ...overrides,
  })
  render(<GoalsTab model={buildExpenseModel(dataset)} actions={actions} />)
  return actions
}

describe('GoalsTab, start all scenarios from today', () => {
  it('offers the switch, off, with the balance and date it would start from', () => {
    renderTab()
    const toggle = screen.getByRole('button', SWITCH)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).toBeEnabled()
    expect(screen.getByText(new RegExp(`on ${formatCheckinDate('2026-10-05')}, your latest check-in`))).toBeInTheDocument()
  })

  it('is unavailable until there is a check-in to start from', () => {
    renderTab({ wealthCheckins: [] })
    expect(screen.getByRole('button', SWITCH)).toBeDisabled()
    expect(screen.getByText('Log a wealth check-in first.')).toBeInTheDocument()
  })

  it('says what it replaces when on, and is never an unsaved edit', async () => {
    const user = userEvent.setup()
    renderTab()

    await user.click(screen.getByRole('button', SWITCH))

    expect(screen.getByRole('button', SWITCH)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/nothing is saved/)).toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', SWITCH))
    expect(screen.getByRole('button', SWITCH)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
  })

  it('saves the draft as the editor has it, not as it is shown', async () => {
    const user = userEvent.setup()
    const actions = renderTab()

    await user.click(screen.getByRole('button', { name: 'Scenario options' }))
    fireEvent.change(screen.getByLabelText('Scenario name'), { target: { value: 'Path A, tweaked' } })
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', SWITCH))
    await user.click(screen.getByRole('button', { name: 'Save changes to Path A, tweaked' }))

    // The restart is the way it is looked at: the start the scenario was saved with is not rewritten.
    const patch = vi.mocked(actions.updateScenario).mock.calls[0]![1]
    expect(patch).toMatchObject({ name: 'Path A, tweaked' })
    expect(patch).not.toHaveProperty('startInvestedCents')
    expect(patch).not.toHaveProperty('planStartDate')
  })

  it('names a scenario that kept its own start because it buys the house at year 0', async () => {
    const user = userEvent.setup()
    const buyNow = makeScenario({
      id: 3,
      name: 'House now',
      sortOrder: 2,
      planStartDate: '2026-06-26',
      housePurchaseYear: 0,
      housePriceCents: 400_000_00,
    })
    renderTab({ goalScenarios: [plan, other, buyNow] })

    expect(screen.queryByText(/Not restarted/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', SWITCH))

    expect(screen.getByText(/Not restarted: House now\. It buys the house at year 0/)).toBeInTheDocument()
  })

  it('stays on through a visit to Progress', async () => {
    const user = userEvent.setup()
    renderTab()

    await user.click(screen.getByRole('button', SWITCH))
    await user.click(screen.getByRole('tab', { name: 'Progress' }))
    await user.click(screen.getByRole('tab', { name: 'Plan' }))

    expect(screen.getByRole('button', SWITCH)).toHaveAttribute('aria-pressed', 'true')
  })

  it('draws the plan once in the tables: its own restart, not a second row for the plan from today', async () => {
    const user = userEvent.setup()
    renderTab()
    const table = () => screen.getByRole('region', { name: 'Scenarios side by side' })

    expect(within(table()).getByText(/Path A, from today/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', SWITCH))

    expect(within(table()).queryByText(/from today/)).not.toBeInTheDocument()
    expect(within(table()).getByText('Path A')).toBeInTheDocument()
    expect(within(table()).getByText('Path B')).toBeInTheDocument()
  })
})
