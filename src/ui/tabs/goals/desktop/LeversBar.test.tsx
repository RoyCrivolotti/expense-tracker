import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_LEVERS } from '../../../../engine'
import { makeScenario } from '../../../../testing/factories'
import { LeversBar } from './LeversBar'

function makeDraft(overrides = {}) {
  const { id, ...rest } = makeScenario({ startInvestedCents: 100_000_000, monthlyContributionCents: 50_000, ...overrides })
  void id
  return rest
}

function renderBar(overrides: Partial<Parameters<typeof LeversBar>[0]> = {}, draftOverrides = {}) {
  const draft = makeDraft(draftOverrides)
  const onChange = vi.fn()
  const onToggle = vi.fn()
  render(
    <LeversBar
      draft={draft}
      resultDraft={draft}
      keys={DEFAULT_LEVERS}
      expanded={false}
      panelId="inputs-panel"
      onChange={onChange}
      onToggle={onToggle}
      {...overrides}
    />,
  )
  return { onChange, onToggle }
}

describe('LeversBar', () => {
  it('shows each lever with its value as the app writes it', () => {
    renderBar()
    expect(screen.getByLabelText('Monthly investing')).toHaveValue('500')
    expect(screen.getByLabelText('Starting invested')).toHaveValue('1.000.000')
    expect(screen.getByLabelText('Horizon (years)')).toHaveValue('30')
    expect(screen.getByLabelText('Real return (%/yr, after inflation)')).toHaveValue('7,0')
    expect(screen.getByText('Never')).toBeInTheDocument()
  })

  it('keeps the cents of an amount that has them', () => {
    renderBar({}, { monthlyContributionCents: 12_345 })
    expect(screen.getByLabelText('Monthly investing')).toHaveValue('123,45')
  })

  it('commits a typed amount on blur and on Enter, in cents', async () => {
    const { onChange } = renderBar()
    const field = screen.getByLabelText('Monthly investing')
    await userEvent.clear(field)
    await userEvent.type(field, '750')
    await userEvent.tab()
    expect(onChange).toHaveBeenLastCalledWith({ monthlyContributionCents: 75_000 })

    const start = screen.getByLabelText('Starting invested')
    await userEvent.clear(start)
    await userEvent.type(start, '2.000.000{Enter}')
    expect(onChange).toHaveBeenLastCalledWith({ startInvestedCents: 200_000_000 })
  })

  it('never commits a negative amount', async () => {
    const { onChange } = renderBar()
    const field = screen.getByLabelText('Monthly investing')
    await userEvent.clear(field)
    await userEvent.type(field, '-5{Enter}')
    expect(onChange).toHaveBeenLastCalledWith({ monthlyContributionCents: 0 })
  })

  it('clamps a typed horizon to its range and ignores what is not a number', async () => {
    const { onChange } = renderBar()
    const horizon = screen.getByLabelText('Horizon (years)')
    await userEvent.clear(horizon)
    await userEvent.type(horizon, '99{Enter}')
    expect(onChange).toHaveBeenLastCalledWith({ horizonYears: 60 })
    onChange.mockClear()
    await userEvent.clear(horizon)
    await userEvent.type(horizon, 'abc{Enter}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('takes a typed percentage as a fraction within its range', async () => {
    const { onChange } = renderBar()
    const ret = screen.getByLabelText('Real return (%/yr, after inflation)')
    await userEvent.clear(ret)
    await userEvent.type(ret, '9,5{Enter}')
    expect(onChange).toHaveBeenLastCalledWith({ expectedRealReturn: 0.095 })
    await userEvent.clear(ret)
    await userEvent.type(ret, '40{Enter}')
    expect(onChange).toHaveBeenLastCalledWith({ expectedRealReturn: 0.15 })
  })

  it('moves a percentage with its slider', () => {
    const { onChange } = renderBar()
    fireEvent.change(screen.getByLabelText('Real return (%/yr, after inflation) slider'), { target: { value: '0.05' } })
    expect(onChange).toHaveBeenLastCalledWith({ expectedRealReturn: 0.05 })
  })

  it('sets the purchase year from its slider, with the first step meaning never', () => {
    const { onChange } = renderBar()
    const slider = screen.getByLabelText('Purchase year slider')
    expect(slider).toHaveAttribute('aria-valuetext', 'Never')
    fireEvent.change(slider, { target: { value: '5' } })
    expect(onChange).toHaveBeenLastCalledWith({ housePurchaseYear: 5 })
  })

  it('lets the purchase year slide back to never', () => {
    const { onChange } = renderBar({}, { housePurchaseYear: 5 })
    fireEvent.change(screen.getByLabelText('Purchase year slider'), { target: { value: '-1' } })
    expect(onChange).toHaveBeenLastCalledWith({ housePurchaseYear: null })
  })

  it('names the purchase year as now, or by its year', () => {
    renderBar({}, { housePurchaseYear: 0 })
    expect(screen.getByText('Now')).toBeInTheDocument()
  })

  it('gives the purchase year slider the horizon as its top', () => {
    renderBar({}, { horizonYears: 12, housePurchaseYear: 4 })
    const slider = screen.getByLabelText('Purchase year slider')
    expect(slider).toHaveAttribute('max', '12')
    expect(screen.getByText('Year 4')).toBeInTheDocument()
  })

  it('shows the net worth the plan ends at, from the draft the charts read', () => {
    const live = makeDraft()
    const charts = makeDraft({ startInvestedCents: 0, monthlyContributionCents: 0 })
    renderBar({ draft: live, resultDraft: charts })
    expect(screen.getByText('Net worth at horizon')).toBeInTheDocument()
    expect(screen.getByText('0 €')).toBeInTheDocument()
  })

  it('opens and closes the rest of the inputs from one button that says which', async () => {
    const { onToggle } = renderBar()
    const button = screen.getByRole('button', { name: 'All inputs' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveAttribute('aria-controls', 'inputs-panel')
    await userEvent.click(button)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('reports the panel as open', () => {
    renderBar({ expanded: true })
    expect(screen.getByRole('button', { name: 'All inputs' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('keeps a control reached with the keyboard out from under it while it is mounted', () => {
    const root = document.documentElement
    root.style.scrollPaddingTop = ''
    const { unmount } = render(
      <LeversBar
        draft={makeDraft()}
        resultDraft={makeDraft()}
        keys={DEFAULT_LEVERS}
        onChange={vi.fn()}
        expanded={false}
        panelId="p"
        onToggle={vi.fn()}
      />,
    )
    expect(root.style.scrollPaddingTop).not.toBe('')
    unmount()
    expect(root.style.scrollPaddingTop).toBe('')
  })

  it('shows only the levers it is given', () => {
    renderBar({ keys: ['rentMonthlyCents'] })
    expect(screen.getByLabelText('Rent (monthly)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Monthly investing')).not.toBeInTheDocument()
  })
})
