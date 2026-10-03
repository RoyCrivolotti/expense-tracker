import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LEVERS, type LeverKey } from '../../../../engine'
import { makeScenario } from '../../../../testing/factories'
import { EXIT_MS, setMotionDisabledForTests } from '../../../hooks/motion'
import { SECTION_KEYS } from '../leverFields'
import { AllInputsPanel } from './AllInputsPanel'

vi.mock('../../../hooks/isNativeDatePicker', () => ({ isNativeDatePicker: () => true }))

function makeDraft() {
  const { id, ...rest } = makeScenario()
  void id
  return rest
}

function renderPanel(open: boolean, omit: ReadonlySet<LeverKey> = new Set(DEFAULT_LEVERS)) {
  const onChange = vi.fn()
  const ui = (isOpen: boolean) => (
    <AllInputsPanel id="panel" open={isOpen} draft={makeDraft()} latest={null} onChange={onChange} omit={omit} />
  )
  const view = render(ui(open))
  return { onChange, view, ui }
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
    renderPanel(true, new Set())
    expect(screen.getByLabelText('Monthly investing')).toBeInTheDocument()
    expect(screen.getByLabelText('Horizon (years)')).toBeInTheDocument()
  })

  it('leaves out a column whose inputs are all in the bar', () => {
    renderPanel(true, new Set([...SECTION_KEYS.portfolio, ...SECTION_KEYS.housing]))
    expect(screen.queryByRole('heading', { name: 'Portfolio' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Housing' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Financial independence' })).toBeInTheDocument()
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
