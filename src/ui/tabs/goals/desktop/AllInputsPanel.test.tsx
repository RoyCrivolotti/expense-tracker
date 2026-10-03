import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LEVERS, MAX_LEVERS, type LeverKey } from '../../../../engine'
import { makeScenario } from '../../../../testing/factories'
import { EXIT_MS, setMotionDisabledForTests } from '../../../hooks/motion'
import { SECTION_KEYS } from '../leverFields'
import type { StarredLevers } from '../useStarredLevers'
import { AllInputsPanel } from './AllInputsPanel'

vi.mock('../../../hooks/isNativeDatePicker', () => ({ isNativeDatePicker: () => true }))

function makeDraft() {
  const { id, ...rest } = makeScenario()
  void id
  return rest
}

function makeStarred(keys: readonly LeverKey[] = DEFAULT_LEVERS, overrides: Partial<StarredLevers> = {}): StarredLevers {
  return {
    keys,
    canEdit: true,
    canAdd: keys.length < MAX_LEVERS,
    isDefault: keys.length === DEFAULT_LEVERS.length && keys.every((k, i) => k === DEFAULT_LEVERS[i]),
    toggle: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  }
}

function renderPanel(open: boolean, starred: StarredLevers = makeStarred(), draft = makeDraft()) {
  const onChange = vi.fn()
  const ui = (isOpen: boolean) => (
    <AllInputsPanel id="panel" open={isOpen} draft={draft} latest={null} onChange={onChange} starred={starred} />
  )
  const view = render(ui(open))
  return { onChange, view, ui, starred }
}

describe('AllInputsPanel', () => {
  it('lays the sections out in columns, without what is in the levers bar', () => {
    renderPanel(true)
    const panel = screen.getByRole('region', { name: 'All inputs' })
    for (const title of ['Portfolio', 'Housing', 'Financial independence', 'Plan start', 'Life events']) {
      expect(within(panel).getByRole('heading', { name: title })).toBeInTheDocument()
    }
    expect(within(panel).getByLabelText('Contribution growth (%/yr)')).toBeInTheDocument()
    expect(within(panel).getByLabelText('House price')).toBeInTheDocument()
    expect(within(panel).queryByLabelText('Monthly investing')).not.toBeInTheDocument()
    expect(within(panel).queryByLabelText('Starting invested')).not.toBeInTheDocument()
    expect(within(panel).queryByText('Purchase year')).not.toBeInTheDocument()
  })

  it('shows every input when none of them is in the bar', () => {
    renderPanel(true, makeStarred([]))
    expect(screen.getByLabelText('Monthly investing')).toBeInTheDocument()
    expect(screen.getByLabelText('Horizon (years)')).toBeInTheDocument()
  })

  it('keeps the portfolio column while any of its inputs is left in it', () => {
    renderPanel(true, makeStarred(SECTION_KEYS.portfolio.slice(0, 4)))
    expect(screen.getByRole('heading', { name: 'Portfolio' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Plan start' })).toBeInTheDocument()
  })

  it('shows the plan start where the portfolio column would be when every portfolio input is in the bar', () => {
    renderPanel(true, makeStarred(SECTION_KEYS.portfolio))
    expect(screen.queryByRole('heading', { name: 'Portfolio' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Plan start' })).toBeInTheDocument()
  })

  it('is not on the page while closed', () => {
    renderPanel(false)
    expect(screen.queryByRole('region', { name: 'All inputs' })).not.toBeInTheDocument()
  })

  it('writes what is edited in it to the draft', async () => {
    const { onChange } = renderPanel(true)
    const rent = screen.getByLabelText('Rent (monthly)')
    await userEvent.clear(rent)
    await userEvent.type(rent, '900{Enter}')
    expect(onChange).toHaveBeenCalledWith({ rentMonthlyCents: 90_000 })
  })
})

describe('AllInputsPanel explanations of what is in the bar', () => {
  const RATES_NOTE = /The mortgage rate and house appreciation are nominal/
  const FI_FORMULA = /FI target = annual spend ÷ this rate/

  it('still gives what the purchase takes from the portfolio while the purchase year is in the bar', () => {
    // The year is in the default five, so the figure would have no other place to be.
    renderPanel(true, makeStarred(), { ...makeDraft(), housePurchaseYear: 5 })

    expect(screen.queryByLabelText('Purchase year')).not.toBeInTheDocument()
    expect(screen.getByText(/Purchase cost from portfolio/)).toBeInTheDocument()
  })

  it('keeps the note on the two rates while either is on the page, and drops it when neither is', () => {
    const { view } = renderPanel(true, makeStarred(['houseAppreciationRate']))
    expect(screen.getByText(RATES_NOTE)).toBeInTheDocument()
    view.unmount()

    const other = renderPanel(true, makeStarred(['mortgageRateAnnual']))
    expect(screen.getByText(RATES_NOTE)).toBeInTheDocument()
    other.view.unmount()

    renderPanel(true, makeStarred(['mortgageRateAnnual', 'houseAppreciationRate']))
    expect(screen.queryByText(RATES_NOTE)).not.toBeInTheDocument()
  })

  it('keeps the FI formula while either of its inputs is on the page, and drops it when neither is', () => {
    const { view } = renderPanel(true, makeStarred(['safeWithdrawalRate']))
    expect(screen.getByText(FI_FORMULA)).toBeInTheDocument()
    view.unmount()

    const other = renderPanel(true, makeStarred(['annualSpendCents']))
    expect(screen.getByText(FI_FORMULA)).toBeInTheDocument()
    other.view.unmount()

    renderPanel(true, makeStarred(['annualSpendCents', 'safeWithdrawalRate']))
    expect(screen.queryByText(FI_FORMULA)).not.toBeInTheDocument()
  })
})

describe('AllInputsPanel stars', () => {
  it('has a star on every input that is not in the bar, and sends it there when pressed', async () => {
    const { starred } = renderPanel(true, makeStarred(DEFAULT_LEVERS.slice(0, 4)))
    // Four in the bar, so the fifth is open to one more: the housing price's star is live.
    await userEvent.click(screen.getByRole('button', { name: 'Add House price to the bar' }))
    expect(starred.toggle).toHaveBeenCalledWith('housePriceCents')
    expect(screen.queryByRole('button', { name: 'Add Monthly investing to the bar' })).not.toBeInTheDocument()
  })

  it('stars every one of the inputs that can be starred, once each', () => {
    renderPanel(true, makeStarred([]))
    const stars = screen.getAllByRole('button', { name: /^Add .* to the bar$/ })
    expect(stars).toHaveLength(15)
  })

  it('holds the stars back, and says why, once the bar is full', () => {
    renderPanel(true)
    const star = screen.getByRole('button', { name: 'Add House price to the bar' })
    expect(star).toBeDisabled()
    expect(star).toHaveAttribute('title', 'The bar holds five. Take one out of it first.')
    expect(screen.getByText('The bar holds five. Take one out of it to star another.')).toBeInTheDocument()
  })

  it('invites a star while there is room', () => {
    renderPanel(true, makeStarred(DEFAULT_LEVERS.slice(0, 2)))
    expect(screen.getByText('Star an input to keep it in the bar above.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add House price to the bar' })).toBeEnabled()
  })

  it('offers the way back to the five only when the bar is not them', async () => {
    const { starred, view, ui } = renderPanel(true)
    expect(screen.queryByRole('button', { name: 'Reset to defaults' })).not.toBeInTheDocument()

    view.unmount()
    const other = makeStarred(['rentMonthlyCents'])
    render(
      <AllInputsPanel id="panel" open draft={makeDraft()} latest={null} onChange={vi.fn()} starred={other} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }))
    expect(other.reset).toHaveBeenCalledTimes(1)
    void starred
    void ui
  })

  it('says nothing about stars, and cannot press one, in a read-only session', () => {
    renderPanel(true, makeStarred([], { canEdit: false, canAdd: false }))
    expect(screen.queryByText(/Star an input/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset to defaults' })).not.toBeInTheDocument()
    const star = screen.getAllByRole('button', { name: /^Add .* to the bar$/ })[0]!
    expect(star).toBeDisabled()
    expect(star).toHaveAttribute('title', 'Read-only session')
  })
})

describe('AllInputsPanel motion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setMotionDisabledForTests(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    setMotionDisabledForTests(true)
  })

  it('folds away over its exit, taking no input while it goes, then leaves the page', () => {
    const { view, ui } = renderPanel(true)
    const panel = screen.getByRole('region', { name: 'All inputs' })
    expect(panel.className).not.toContain('folding')

    view.rerender(ui(false))

    expect(panel.className).toContain('folding')
    expect(panel.hasAttribute('inert')).toBe(true)
    expect(panel.style.getPropertyValue('--exit-ms')).toBe(`${EXIT_MS.fold}ms`)
    void act(() => vi.advanceTimersByTime(EXIT_MS.fold))
    expect(screen.queryByRole('region', { name: 'All inputs' })).not.toBeInTheDocument()
  })
})
