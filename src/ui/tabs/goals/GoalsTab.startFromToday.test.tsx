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

const SAVED = { name: 'As saved' }
const TODAY = { name: 'My balance today' }

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

const viewGroup = () => screen.getByRole('radiogroup', { name: 'Where the scenarios start from' })

describe('GoalsTab, start from my balance today', () => {
  it('offers a two-way switch in the scenario row, on "As saved", with the balance it would use', () => {
    renderTab()
    const group = viewGroup()
    expect(within(group).getByRole('radio', SAVED)).toBeChecked()
    expect(within(group).getByRole('radio', TODAY)).not.toBeChecked()
    expect(screen.getByText(new RegExp(`My balance today is .* on ${formatCheckinDate('2026-10-05')}, your latest check-in`))).toBeInTheDocument()
    // With the scenarios, not under the chart: the tabs and the switch share a bar.
    expect(screen.getByRole('tablist', { name: 'Scenarios' }).parentElement?.parentElement).toContainElement(group)
  })

  it('is unavailable until there is a check-in to start from, and says so', () => {
    renderTab({ wealthCheckins: [] })
    expect(within(viewGroup()).getByRole('radio', TODAY)).toBeDisabled()
    expect(screen.getByText('Log a wealth check-in to see the scenarios from your balance today.')).toBeInTheDocument()
  })

  it('says it is a view, not a change, when on, and is never an unsaved edit', async () => {
    const user = userEvent.setup()
    renderTab()

    await user.click(within(viewGroup()).getByRole('radio', TODAY))

    expect(within(viewGroup()).getByRole('radio', TODAY)).toBeChecked()
    expect(screen.getByText(/Viewing every scenario from .* on .*, your latest check-in\. Nothing is saved\./)).toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()

    await user.click(within(viewGroup()).getByRole('radio', SAVED))
    expect(within(viewGroup()).getByRole('radio', SAVED)).toBeChecked()
    expect(screen.queryByText(/Viewing every scenario/)).not.toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
  })

  it('keeps the long account behind Details, not in the line', async () => {
    const user = userEvent.setup()
    renderTab()
    await user.click(within(viewGroup()).getByRole('radio', TODAY))

    const details = screen.getByText('Details').closest('details')!
    expect(details).not.toHaveAttribute('open')
    await user.click(screen.getByText('Details'))
    expect(details).toHaveAttribute('open')
    expect(within(details).getByText(/only its starting balance and start date are replaced, and only invested money counts/)).toBeInTheDocument()
    expect(within(details).getByText(/restart it under Plan start/)).toBeInTheDocument()
  })

  it('saves the draft as the editor has it, not as it is shown', async () => {
    const user = userEvent.setup()
    const actions = renderTab()

    await user.click(screen.getByRole('button', { name: 'Scenario options' }))
    fireEvent.change(screen.getByLabelText('Scenario name'), { target: { value: 'Path A, tweaked' } })
    await user.keyboard('{Escape}')
    await user.click(within(viewGroup()).getByRole('radio', TODAY))
    await user.click(screen.getByRole('button', { name: 'Save changes to Path A, tweaked' }))

    // The restart is the way it is looked at: the start the scenario was saved with is not rewritten.
    const patch = vi.mocked(actions.updateScenario).mock.calls[0]![1]
    expect(patch).toMatchObject({ name: 'Path A, tweaked' })
    expect(patch).not.toHaveProperty('startInvestedCents')
    expect(patch).not.toHaveProperty('planStartDate')
  })

  it('tags a scenario that kept its own start because it buys the house at year 0, and says why behind Details', async () => {
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

    const tab = () => screen.getByRole('tab', { name: /House now/ })
    expect(within(tab()).queryByText('own start')).not.toBeInTheDocument()
    await user.click(within(viewGroup()).getByRole('radio', TODAY))

    expect(within(tab()).getByText('own start')).toBeInTheDocument()
    expect(within(screen.getByRole('tab', { name: /Path B/ })).queryByText('own start')).not.toBeInTheDocument()
    await user.click(screen.getByText('Details'))
    expect(screen.getByText(/House now is tagged "own start": it buys the house at year 0/)).toBeInTheDocument()
  })

  it('stays on through a visit to Progress', async () => {
    const user = userEvent.setup()
    renderTab()

    await user.click(within(viewGroup()).getByRole('radio', TODAY))
    await user.click(screen.getByRole('tab', { name: 'Progress' }))
    await user.click(screen.getByRole('tab', { name: 'Plan' }))

    expect(within(viewGroup()).getByRole('radio', TODAY)).toBeChecked()
  })

  it('draws the plan once in the tables: its own restart, not a second row for the plan from today', async () => {
    const user = userEvent.setup()
    renderTab()
    const table = () => screen.getByRole('region', { name: 'Scenarios side by side' })

    expect(within(table()).getByText(/Path A, from today/)).toBeInTheDocument()

    await user.click(within(viewGroup()).getByRole('radio', TODAY))

    expect(within(table()).queryByText(/from today/)).not.toBeInTheDocument()
    expect(within(table()).getByText('Path A')).toBeInTheDocument()
    expect(within(table()).getByText('Path B')).toBeInTheDocument()
  })
})
