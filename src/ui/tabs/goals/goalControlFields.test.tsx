import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../hooks/isNativeDatePicker', () => ({ isNativeDatePicker: () => true }))

import { DateField, MoneyField, NumberField, PercentField, PurchaseYearField } from './goalControlFields'

describe('MoneyField', () => {
  it('is a plain input with no slider, and takes any amount typed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MoneyField label="Starting invested" value={10_000_00} onChange={onChange} />)

    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    const input = screen.getByRole('textbox', { name: 'Starting invested' })
    await user.clear(input)
    await user.type(input, '1000000')
    await user.tab()

    expect(onChange).toHaveBeenCalledWith(1_000_000_00)
  })

  it('commits on Enter and never goes below zero', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MoneyField label="Rent (monthly)" value={100_000} onChange={onChange} />)

    const input = screen.getByRole('textbox', { name: 'Rent (monthly)' })
    await user.clear(input)
    await user.type(input, '-500{Enter}')

    expect(onChange).toHaveBeenCalledWith(0)
  })
})

describe('NumberField', () => {
  it('steps by one with the buttons and stops at the bounds', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(
      <NumberField label="Horizon (years)" value={29} min={1} max={30} onChange={onChange} />,
    )

    await user.click(screen.getByRole('button', { name: 'Increase Horizon (years)' }))
    expect(onChange).toHaveBeenLastCalledWith(30)
    await user.click(screen.getByRole('button', { name: 'Decrease Horizon (years)' }))
    expect(onChange).toHaveBeenLastCalledWith(28)

    rerender(<NumberField label="Horizon (years)" value={30} min={1} max={30} onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Increase Horizon (years)' })).toBeDisabled()
    rerender(<NumberField label="Horizon (years)" value={1} min={1} max={30} onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Decrease Horizon (years)' })).toBeDisabled()
  })

  it('takes a typed whole number, clamped to the bounds, and ignores junk', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NumberField label="Mortgage term (years)" value={20} min={1} max={40} onChange={onChange} />)

    const input = screen.getByRole('textbox', { name: 'Mortgage term (years)' })
    await user.clear(input)
    await user.type(input, '75{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(40)

    await user.clear(input)
    await user.type(input, '12,7')
    await user.tab()
    expect(onChange).toHaveBeenLastCalledWith(13)

    onChange.mockClear()
    await user.clear(input)
    await user.type(input, 'abc')
    await user.tab()
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('DateField', () => {
  it('renders with a null value showing empty input', () => {
    render(<DateField label="Plan start date" value={null} onChange={vi.fn()} />)
    const input = screen.getByLabelText('Plan start date')
    expect(input).toHaveValue('')
  })

  it('renders with an existing date value', () => {
    render(<DateField label="Plan start date" value="2024-01-15" onChange={vi.fn()} />)
    const input = screen.getByLabelText('Plan start date')
    expect(input).toHaveValue('2024-01-15')
  })

  it('calls onChange with the new date string when changed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateField label="Plan start date" value={null} onChange={onChange} />)
    const input = screen.getByLabelText('Plan start date')
    await user.type(input, '2024-06-01')
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange with null when date is cleared', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateField label="Plan start date" value="2024-01-15" onChange={onChange} />)
    const input = screen.getByLabelText('Plan start date')
    await user.clear(input)
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('renders an optional hint', () => {
    render(
      <DateField
        label="Plan start date"
        value={null}
        hint="Anchors the projection to a date."
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Anchors the projection to a date.')).toBeInTheDocument()
  })
})

describe('PercentField', () => {
  it('names the stepper, its buttons and the slider after the field, and reads the slider as a percentage', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PercentField label="Mortgage rate (%/yr)" value={0.035} onChange={onChange} />)

    expect(screen.getByRole('textbox', { name: 'Mortgage rate (%/yr)' })).toHaveValue('3,5')
    expect(screen.getByRole('slider', { name: 'Mortgage rate (%/yr)' })).toHaveAttribute('aria-valuetext', '3,5%')
    await user.click(screen.getByRole('button', { name: 'Increase Mortgage rate (%/yr)' }))
    expect(onChange).toHaveBeenLastCalledWith(0.04)
    await user.click(screen.getByRole('button', { name: 'Decrease Mortgage rate (%/yr)' }))
    expect(onChange.mock.lastCall?.[0]).toBeCloseTo(0.03, 10)
  })
})

describe('PurchaseYearField', () => {
  it('reads out the year, not the position, and offers a never at the start', () => {
    render(<PurchaseYearField value={4} maxYear={10} onChange={vi.fn()} />)
    const slider = screen.getByRole('slider', { name: 'Purchase year' })
    expect(slider).toHaveAttribute('aria-valuetext', 'Year 4')
    expect(slider).toHaveAttribute('min', '-1')
    expect(slider).toHaveAttribute('max', '10')
  })

  it('keeps a year past the horizon on the track instead of clamping it to the end', () => {
    render(<PurchaseYearField value={15} maxYear={10} onChange={vi.fn()} />)
    const slider = screen.getByRole('slider', { name: 'Purchase year' })
    expect(slider).toHaveAttribute('max', '15')
    expect(slider).toHaveValue('15')
    expect(slider).toHaveAttribute('aria-valuetext', 'Year 15')
  })
})
