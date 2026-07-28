import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GoalControls } from './GoalControls'
import { makeScenario } from '../../../testing/factories'

function makeDraft() {
  const { id, ...rest } = makeScenario()
  void id
  return rest
}

describe('GoalControls', () => {
  it('renders core portfolio fields', () => {
    render(<GoalControls draft={makeDraft()} onChange={vi.fn()} />)
    expect(screen.getByText('Portfolio')).toBeInTheDocument()
    expect(screen.getByLabelText('Starting invested')).toBeInTheDocument()
    expect(screen.getByLabelText('Monthly investing')).toBeInTheDocument()
  })

  it('renders the newly exposed contribution growth control', () => {
    render(<GoalControls draft={makeDraft()} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Contribution growth (%/yr)')).toBeInTheDocument()
  })

  it('renders the mortgage rate control in Housing section', () => {
    render(<GoalControls draft={makeDraft()} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Mortgage rate (%/yr)')).toBeInTheDocument()
  })

  it('renders the mortgage term control', () => {
    render(<GoalControls draft={makeDraft()} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Mortgage term (years)')).toBeInTheDocument()
  })

  it('renders the house appreciation control', () => {
    render(<GoalControls draft={makeDraft()} onChange={vi.fn()} />)
    expect(screen.getByLabelText('House appreciation (%/yr)')).toBeInTheDocument()
  })

  it('renders the Plan tracking section (collapsed by default)', () => {
    render(<GoalControls draft={makeDraft()} onChange={vi.fn()} />)
    expect(screen.getByText('Plan tracking')).toBeInTheDocument()
  })

  it('renders the plan start date input', () => {
    render(<GoalControls draft={makeDraft()} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Plan start date')).toBeInTheDocument()
  })

  it('shows the current planStartDate value', () => {
    const draft = { ...makeDraft(), planStartDate: '2024-03-15' }
    render(<GoalControls draft={draft} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Plan start date')).toHaveValue('2024-03-15')
  })

  it('calls onChange with annualContributionGrowth when slider changes', () => {
    const onChange = vi.fn()
    render(<GoalControls draft={makeDraft()} onChange={onChange} />)
    const slider = screen.getByRole('slider', { name: 'Contribution growth (%/yr)' })
    fireEvent.change(slider, { target: { value: '0.03' } })
    expect(onChange).toHaveBeenCalledWith({ annualContributionGrowth: 0.03 })
  })

  it('calls onChange with mortgageRateAnnual when mortgage rate slider changes', () => {
    const onChange = vi.fn()
    render(<GoalControls draft={makeDraft()} onChange={onChange} />)
    const slider = screen.getByRole('slider', { name: 'Mortgage rate (%/yr)' })
    fireEvent.change(slider, { target: { value: '0.04' } })
    expect(onChange).toHaveBeenCalledWith({ mortgageRateAnnual: 0.04 })
  })

  it('calls onChange with mortgageTermYears when text input commits', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<GoalControls draft={makeDraft()} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'Mortgage term (years)' })
    await user.clear(input)
    await user.type(input, '25')
    await user.tab()
    expect(onChange).toHaveBeenCalledWith({ mortgageTermYears: 25 })
  })

  it('calls onChange with houseAppreciationRate when slider changes', () => {
    const onChange = vi.fn()
    render(<GoalControls draft={makeDraft()} onChange={onChange} />)
    const slider = screen.getByRole('slider', { name: 'House appreciation (%/yr)' })
    fireEvent.change(slider, { target: { value: '0.03' } })
    expect(onChange).toHaveBeenCalledWith({ houseAppreciationRate: 0.03 })
  })

  it('calls onChange with planStartDate when date input changes', () => {
    const onChange = vi.fn()
    render(<GoalControls draft={makeDraft()} onChange={onChange} />)
    const dateInput = screen.getByLabelText('Plan start date')
    fireEvent.change(dateInput, { target: { value: '2024-06-01' } })
    expect(onChange).toHaveBeenCalledWith({ planStartDate: '2024-06-01' })
  })

  it('renders the Life events section', () => {
    render(<GoalControls draft={makeDraft()} onChange={vi.fn()} />)
    expect(screen.getByText('Life events')).toBeInTheDocument()
  })

  it('shows an add button in Life events section', () => {
    render(<GoalControls draft={makeDraft()} onChange={vi.fn()} />)
    expect(screen.getByText('+ Add life event')).toBeInTheDocument()
  })

  it('opens the add form when clicking Add life event', async () => {
    const user = userEvent.setup()
    render(<GoalControls draft={makeDraft()} onChange={vi.fn()} />)
    await user.click(screen.getByText('+ Add life event'))
    expect(screen.getByLabelText('Life event label')).toBeInTheDocument()
  })

  it('calls onChange with new event when adding', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<GoalControls draft={makeDraft()} onChange={onChange} />)
    await user.click(screen.getByText('+ Add life event'))
    const labelInput = screen.getByLabelText('Life event label')
    await user.type(labelInput, 'Inheritance')
    await user.click(screen.getByRole('button', { name: /^Add$/ }))
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1] as [
      { lifeEvents: { label: string }[] },
    ]
    expect(lastCall[0].lifeEvents).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Inheritance' })]),
    )
  })

  it('displays existing life events in the list', () => {
    const draft = {
      ...makeDraft(),
      lifeEvents: [{ year: 3, amountCents: 10_000_000, label: 'Bonus' }],
    }
    render(<GoalControls draft={draft} onChange={vi.fn()} />)
    expect(screen.getByText('Bonus')).toBeInTheDocument()
  })

  it('calls onChange without event when removing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const draft = {
      ...makeDraft(),
      lifeEvents: [{ year: 3, amountCents: 10_000_000, label: 'Bonus' }],
    }
    render(<GoalControls draft={draft} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Remove Bonus' }))
    expect(onChange).toHaveBeenCalledWith({ lifeEvents: [] })
  })

  it('cancels the add form without calling onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<GoalControls draft={makeDraft()} onChange={onChange} />)
    await user.click(screen.getByText('+ Add life event'))
    await user.click(screen.getByRole('button', { name: /Cancel/ }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Life event label')).not.toBeInTheDocument()
  })
})
