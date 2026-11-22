import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GoalsTab } from './GoalsTab'
import { NARROW_MQ } from './useGoalsNarrow'
import { installFakeMatchMedia } from '../../../testing/fakeMatchMedia'
import { buildExpenseModel } from '../../buildExpenseModel'
import { makeDataset, makeScenario, makeWealthAccount, makeWealthCheckin } from '../../../testing/factories'
import { makeActions } from '../../../testing/makeActions'
import { samplePlan } from '../../../testing/samplePlan'

let media: ReturnType<typeof installFakeMatchMedia>
beforeAll(() => {
  media = installFakeMatchMedia()
})
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 21, 12))
})
afterEach(() => {
  vi.useRealTimers()
  media.setMatching(() => false)
})

/** Path A is the plan; Path B buys its house in year 8; one check-in, after both start. */
function model() {
  const dataset = makeDataset({
    goalScenarios: [
      samplePlan({ id: 1, name: 'Path A', isActive: true, housePurchaseYear: null, sortOrder: 0 }),
      samplePlan({ id: 2, name: 'Path B', isActive: false, color: '#10b981', sortOrder: 1 }),
    ],
    wealthAccounts: [makeWealthAccount({ id: 1 })],
    wealthCheckins: [
      makeWealthCheckin({ id: 1, checkinDate: '2026-10-01', entries: [{ accountId: 1, valueCents: 8_000_000 }] }),
    ],
  })
  return buildExpenseModel(dataset)
}

describe('Start a copy later…', () => {
  it('on a wide screen, makes one copy of the open scenario from its menu, unsaved edits included, and leaves the scenario as it was', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const actions = makeActions()
    vi.mocked(actions.createScenario).mockResolvedValue(makeScenario({ id: 3, name: 'Path B, from 2026' }))
    render(<GoalsTab model={model()} actions={actions} />)
    await user.click(screen.getByRole('tab', { name: /^Path B/ }))
    // An edit that is not saved: the copy carries it, as Duplicate does, and it is never written to Path B.
    await user.click(screen.getByRole('button', { name: 'Scenario options' }))
    fireEvent.change(screen.getByLabelText('Scenario name'), { target: { value: 'Path B edited' } })
    await user.click(screen.getByRole('button', { name: 'Start a copy later…' }))

    const sheet = screen.getByRole('dialog', { name: 'Start a copy of "Path B edited" later' })
    expect(sheet).toHaveTextContent('Your investments in your check-in of')
    await user.click(screen.getByRole('button', { name: 'Create scenario' }))

    expect(actions.createScenario).toHaveBeenCalledTimes(1)
    const input = vi.mocked(actions.createScenario).mock.calls[0]![0]
    expect(input).toMatchObject({
      name: 'Path B edited, from 2026',
      planStartDate: '2026-10-01',
      startInvestedCents: 8_000_000,
      sortOrder: 2,
    })
    expect(input).not.toHaveProperty('isActive')
    expect(actions.updateScenario).not.toHaveBeenCalled()
    expect(actions.activateScenario).not.toHaveBeenCalled()
    await act(async () => {
      await Promise.resolve()
    })
  })

  it('on a phone, is a button on the scenario card that opens the same sheet', async () => {
    media.setMatching((query) => query === NARROW_MQ)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<GoalsTab model={model()} actions={makeActions()} />)
    await user.click(screen.getByRole('tab', { name: 'Scenarios' }))
    await user.click(screen.getByRole('button', { name: 'Start a copy later…' }))
    expect(screen.getByRole('dialog', { name: 'Start a copy of "Path A" later' })).toBeInTheDocument()
  })

  it('is not offered in a read-only session', async () => {
    media.setMatching((query) => query === NARROW_MQ)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<GoalsTab model={model()} />)
    await user.click(screen.getByRole('tab', { name: 'Scenarios' }))
    expect(screen.queryByRole('button', { name: 'Start a copy later…' })).toBeNull()
  })
})
