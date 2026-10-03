import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { memo, type ComponentType } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GoalsTab } from './GoalsTab'
import { NARROW_MQ } from './useGoalsNarrow'
import { installFakeMatchMedia } from '../../../testing/fakeMatchMedia'
import { buildExpenseModel } from '../../buildExpenseModel'
import { makeDataset, makeScenario } from '../../../testing/factories'
import { makeActions } from '../../../testing/makeActions'

// The charts are memoised so that anything in the tab that is not about the draft leaves them
// alone. Each is wrapped in a memo of its own, so a count is a render that GoalsTab's props
// asked for: a prop that changes identity on every render shows up as a count that climbs.
type Chart = ComponentType<Record<string, unknown>>

const renders = vi.hoisted(() => ({ nowCard: 0, miniChart: 0, hero: 0 }))

vi.mock('./charts/NetWorthNowCard', async (importOriginal) => {
  const { NetWorthNowCard: Real } = await importOriginal<{ NetWorthNowCard: Chart }>()
  return {
    NetWorthNowCard: memo((props: Record<string, unknown>) => {
      renders.nowCard++
      return <Real {...props} />
    }),
  }
})

vi.mock('./charts/NetWorthChart', async (importOriginal) => {
  const { NetWorthChart: Real } = await importOriginal<{ NetWorthChart: Chart }>()
  return {
    NetWorthChart: memo((props: Record<string, unknown>) => {
      renders.hero++
      return <Real {...props} />
    }),
  }
})

vi.mock('./charts/NetWorthMiniChart', async (importOriginal) => {
  const { NetWorthMiniChart: Real } = await importOriginal<{ NetWorthMiniChart: Chart }>()
  return {
    NetWorthMiniChart: memo((props: Record<string, unknown>) => {
      renders.miniChart++
      return <Real {...props} />
    }),
  }
})

let media: ReturnType<typeof installFakeMatchMedia>

beforeAll(() => {
  media = installFakeMatchMedia()
})

beforeEach(() => {
  renders.nowCard = 0
  renders.miniChart = 0
  renders.hero = 0
  // Opening Scenarios scrolls to its controls, which jsdom does not implement.
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  media.setMatching(() => false)
})

function twoScenarios() {
  const plan = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true })
  const other = makeScenario({ id: 2, name: 'Path B', sortOrder: 1 })
  return buildExpenseModel(makeDataset({ goalScenarios: [plan, other] }))
}

describe('GoalsTab renders', () => {
  it('leaves the now card alone when something other than the draft changes', async () => {
    const user = userEvent.setup()
    render(<GoalsTab model={twoScenarios()} actions={makeActions()} />)
    const settled = renders.nowCard
    expect(settled).toBeGreaterThan(0)

    // Hiding a line, trying the Nominal view and previewing an inflation each re-render the tab.
    await user.click(screen.getAllByRole('button', { name: 'Hide Path B on chart' })[0]!)
    await user.click(screen.getByRole('radio', { name: 'Nominal' }))
    const field = screen.getByLabelText('Preview inflation').parentElement!
    await user.click(within(field).getByRole('button', { name: 'Increase percentage' }))

    expect(renders.nowCard).toBe(settled)
  })

  it('redraws the now card once the draft is edited', () => {
    render(<GoalsTab model={twoScenarios()} actions={makeActions()} />)
    const settled = renders.nowCard

    fireEvent.change(screen.getByLabelText('Scenario name'), { target: { value: 'Path A, tweaked' } })

    expect(renders.nowCard).toBeGreaterThan(settled)
  })

  it('leaves the pinned chart in Scenarios alone when something other than the draft changes', async () => {
    media.setMatching((query) => query === NARROW_MQ)
    const user = userEvent.setup()
    render(<GoalsTab model={twoScenarios()} actions={makeActions()} />)
    await user.click(screen.getByRole('tab', { name: 'Scenarios' }))
    const settled = renders.miniChart
    expect(settled).toBeGreaterThan(0)

    await user.click(screen.getAllByRole('button', { name: 'Hide Path B on chart' })[0]!)

    expect(renders.miniChart).toBe(settled)
  })
  it('leaves the hero chart alone when the question about discarding edits opens and closes', async () => {
    const user = userEvent.setup()
    render(<GoalsTab model={twoScenarios()} actions={makeActions()} />)
    fireEvent.change(screen.getByLabelText('Scenario name'), { target: { value: 'Path A, tweaked' } })
    const settled = renders.hero
    expect(settled).toBeGreaterThan(0)

    // Choosing another scenario with edits unsaved asks first, which is the editor's state
    // changing and nothing the chart is drawn from.
    await user.click(screen.getByRole('button', { name: 'Path B' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(renders.hero).toBe(settled)
  })

  it('redraws the hero chart when a line is hidden', async () => {
    const user = userEvent.setup()
    render(<GoalsTab model={twoScenarios()} actions={makeActions()} />)
    const settled = renders.hero

    await user.click(screen.getAllByRole('button', { name: 'Hide Path B on chart' })[0]!)

    expect(renders.hero).toBeGreaterThan(settled)
  })
})
