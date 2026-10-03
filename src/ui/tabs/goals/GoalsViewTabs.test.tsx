import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { GoalsTab } from './GoalsTab'
import { NARROW_MQ } from './useGoalsNarrow'
import { buildExpenseModel } from '../../buildExpenseModel'
import { installFakeMatchMedia } from '../../../testing/fakeMatchMedia'
import { makeDataset } from '../../../testing/factories'

let media: ReturnType<typeof installFakeMatchMedia>

beforeAll(() => {
  media = installFakeMatchMedia()
})

/** The view row is the tabs of one panel: what the row selects is what the panel is named for. */
describe('the Goals view row as tabs', () => {
  // Opening Scenarios scrolls to its controls, which jsdom does not implement.
  let scrollBy: MockInstance
  beforeEach(() => {
    scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
  })
  afterEach(() => {
    scrollBy.mockRestore()
    media.setMatching(() => false)
  })

  const renderTab = () => render(<GoalsTab model={buildExpenseModel(makeDataset())} />)
  const tabLabels = () =>
    within(screen.getByRole('tablist', { name: 'Goals view' }))
      .getAllByRole('tab')
      .map((t) => t.textContent)

  it('is a tab list over a panel named by the selected tab on a wide screen', async () => {
    const user = userEvent.setup()
    renderTab()

    expect(tabLabels()).toEqual(['Plan', 'Progress', 'Assumptions'])
    const panel = screen.getByRole('tabpanel', { name: 'Plan' })
    expect(screen.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-controls', panel.id)
    expect(within(panel).getByText('What do these terms mean?')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Progress' }))

    expect(screen.getByRole('tabpanel', { name: 'Progress' })).toBe(panel)
    expect(within(panel).getByText('Progress snapshot')).toBeInTheDocument()
  })

  it('names the panel for the half of Plan that is open on a phone', async () => {
    media.setMatching((query) => query === NARROW_MQ)
    const user = userEvent.setup()
    renderTab()

    expect(tabLabels()).toEqual(['Chart', 'Progress', 'Scenarios', 'Assumptions'])
    expect(screen.getByRole('tabpanel', { name: 'Chart' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Scenarios' }))
    expect(screen.getByRole('tabpanel', { name: 'Scenarios' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Assumptions' }))
    expect(screen.getByRole('tabpanel', { name: 'Assumptions' })).toBeInTheDocument()
  })

  it('keeps the panel named when the window crosses the breakpoint', () => {
    media.setMatching((query) => query === NARROW_MQ)
    renderTab()
    expect(screen.getByRole('tabpanel', { name: 'Chart' })).toBeInTheDocument()

    act(() => media.change(NARROW_MQ, false))

    expect(screen.getByRole('tabpanel', { name: 'Plan' })).toBeInTheDocument()
  })

  it('moves between the views with the arrow keys, the selection following the focus', async () => {
    media.setMatching((query) => query === NARROW_MQ)
    const user = userEvent.setup()
    renderTab()
    screen.getByRole('tab', { name: 'Chart' }).focus()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Progress' })).toHaveFocus()
    expect(screen.getByRole('tabpanel', { name: 'Progress' })).toBeInTheDocument()

    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Assumptions' })).toHaveFocus()
    expect(screen.getByRole('tabpanel', { name: 'Assumptions' })).toBeInTheDocument()
  })
})
