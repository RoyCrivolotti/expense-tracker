import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeScenario } from '../../../../testing/factories'
import { createHeroLegendStore, type HeroLegendStore } from '../charts/heroLegendStore'
import type { ScenarioLegendItem } from '../charts/ScenarioSeriesLegend'
import { ScenarioChips } from './ScenarioChips'

const plan = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true, color: '#10b981' })
const other = makeScenario({ id: 2, name: 'Path B', sortOrder: 1, color: '#f59e0b' })

const draftLine: ScenarioLegendItem = { label: 'Path A', color: '#10b981', dashed: true, valueCents: 820_000_000 }
const lineOfB: ScenarioLegendItem = { label: 'Path B', color: '#f59e0b', valueCents: 440_000_000, scenarioId: 2 }

function setup(overrides: Partial<Parameters<typeof ScenarioChips>[0]> = {}, items: ScenarioLegendItem[] = [draftLine, lineOfB]) {
  const legend: HeroLegendStore = createHeroLegendStore()
  legend.set(items)
  const props = {
    scenarios: [plan, other],
    activeId: 1,
    dirty: false,
    draftName: 'Path A',
    showDraft: false,
    onSelect: vi.fn(),
    onSelectDraft: vi.fn(),
    legend,
    onToggleVisible: vi.fn(),
    ...overrides,
  }
  render(<ScenarioChips {...props} />)
  return { ...props, legend }
}

const chipOf = (name: string | RegExp) => screen.getByRole('tab', { name }).parentElement as HTMLElement

describe('ScenarioChips', () => {
  it('gives each scenario the value its line has in the chart, and the open one the draft line\'s', () => {
    setup()
    expect(chipOf(/^Path A/)).toHaveTextContent('8.200.000')
    expect(chipOf('Path B')).toHaveTextContent('4.400.000')
  })

  it('follows the chart as it publishes new values', () => {
    const { legend } = setup()
    act(() => legend.set([draftLine, { ...lineOfB, valueCents: 130_000_000 }]))
    expect(chipOf('Path B')).toHaveTextContent('1.300.000')
  })

  it('shows no value before the chart has published any', () => {
    setup({}, [])
    expect(chipOf('Path B')).not.toHaveTextContent(/\d/)
  })

  it('opens the scenario of the chip that is chosen', async () => {
    const { onSelect } = setup()
    await userEvent.click(screen.getByRole('tab', { name: 'Path B' }))
    expect(onSelect).toHaveBeenCalledWith(other)
  })

  it('hides and shows a line from the eye, which says what it will do', async () => {
    const { onToggleVisible, legend } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Hide Path B on chart' }))
    expect(onToggleVisible).toHaveBeenCalledWith(2)

    act(() => legend.set([draftLine, { ...lineOfB, hidden: true, valueCents: null }]))
    const eye = screen.getByRole('button', { name: 'Show Path B on chart' })
    expect(eye).toHaveAttribute('aria-pressed', 'false')
    // Dimmed, with no value: there is no line to read one off.
    expect(chipOf('Path B')).not.toHaveTextContent(/\d/)
  })

  it('has no eye on the open scenario, whose line is the one being edited', () => {
    setup()
    expect(screen.queryByRole('button', { name: /Path A on chart/ })).not.toBeInTheDocument()
  })

  it('has no eyes where nothing can be hidden', () => {
    setup({ onToggleVisible: undefined })
    expect(screen.queryByRole('button', { name: /on chart/ })).not.toBeInTheDocument()
  })

  it('tags the plan, and the open scenario when it has edits, on the chips themselves', () => {
    setup({ dirty: true })
    // Drawn on the chip's edge, and said in words to a screen reader.
    expect(within(chipOf(/^Path A/)).getByText('Plan')).toBeInTheDocument()
    expect(within(chipOf(/^Path A/)).getAllByText('Edited')).toHaveLength(2)
    expect(within(chipOf('Path B')).queryByText('Plan')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Path A Current plan Edited' })).toBeInTheDocument()
  })

  it('names the open scenario as it is typed, and the draft by what it is', () => {
    setup({ draftName: 'Path A!' })
    expect(screen.getByRole('tab', { name: /^Path A! / })).toBeInTheDocument()
  })

  it('shows the unsaved draft as a chip of its own, with the draft line\'s value, and opens it', async () => {
    const { onSelectDraft } = setup({ scenarios: [], activeId: null, showDraft: true }, [draftLine])
    expect(chipOf('Unsaved draft')).toHaveTextContent('8.200.000')
    await userEvent.click(screen.getByRole('tab', { name: 'Unsaved draft' }))
    expect(onSelectDraft).toHaveBeenCalled()
  })

  it('does not take the dotted plan-from-today line for the draft\'s', () => {
    setup({}, [{ label: 'Path A, from today', color: '#10b981', dotted: true, valueCents: 999_000_000 }, draftLine, lineOfB])
    expect(chipOf(/^Path A/)).toHaveTextContent('8.200.000')
  })
})
