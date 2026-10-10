import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MAX_MONEY_CENTS } from '../../../engine'
import { MoneyFormatContext } from '../../hooks/moneyFormatContext'

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
    expect(slider).toHaveAttribute('aria-valuetext', 'Year 15, past horizon')
  })

  it('calls year 0 "Already own", since nothing is paid for it later', () => {
    render(<PurchaseYearField value={0} maxYear={10} onChange={vi.fn()} />)
    expect(screen.getByRole('slider', { name: 'Purchase year' })).toHaveAttribute('aria-valuetext', 'Already own')
    expect(screen.queryByText('Now')).not.toBeInTheDocument()
  })
})

describe('typing nothing, or something that is not a number, into a field', () => {
  it('leaves an amount as it was and puts it back in the box', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MoneyField label="House price" value={400_000_00} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'House price' })
    const shown = (input as HTMLInputElement).value

    await user.clear(input)
    await user.tab()
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue(shown)

    await user.clear(input)
    await user.type(input, 'abc{Enter}')
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue(shown)
  })

  it('leaves a whole number as it was and puts it back in the box', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NumberField label="Mortgage term (years)" value={25} min={1} max={40} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'Mortgage term (years)' })

    await user.clear(input)
    await user.tab()
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('25')

    await user.clear(input)
    await user.type(input, 'abc')
    await user.tab()
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('25')
  })

  it('leaves a percentage as it was and puts it back in the box', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PercentField label="Mortgage rate (%/yr)" value={0.035} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'Mortgage rate (%/yr)' })

    await user.clear(input)
    await user.tab()
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('3,5')

    await user.clear(input)
    await user.type(input, '%{Enter}')
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('3,5')
  })
})

describe('typing a number with a letter in it, or too many digits, into a field', () => {
  it.each(['250k', '1e9', '1.5M'])('takes %s for no amount at all and puts the amount back, not the digits in it', async (typed) => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MoneyField label="House price" value={400_000_00} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'House price' })
    const shown = (input as HTMLInputElement).value

    await user.clear(input)
    await user.type(input, `${typed}{Enter}`)
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue(shown)
  })

  it('reads an amount written the other way round, with the point for thousands in a comma format', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MoneyField label="House price" value={400_000_00} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'House price' })
    await user.clear(input)
    await user.type(input, '1,234.56{Enter}')
    expect(onChange).toHaveBeenCalledWith(123_456)
  })

  it('holds a number with hundreds of digits to the ceiling, which the box then shows', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MoneyField label="House price" value={400_000_00} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'House price' })
    await user.clear(input)
    await user.click(input)
    await user.paste('9'.repeat(310))
    await user.tab()
    expect(onChange).toHaveBeenCalledWith(MAX_MONEY_CENTS)
    expect(input).not.toHaveValue('9'.repeat(310))
    expect((input as HTMLInputElement).value).not.toMatch(/∞|Infinity/)
  })

  it('takes "about 4" for no percentage, not for the least the field allows', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PercentField label="Withdrawal rate (%)" value={0.04} min={0.005} max={0.2} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'Withdrawal rate (%)' })
    await user.clear(input)
    await user.type(input, 'about 4{Enter}')
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('4,0')
  })

  it('shows the value a number was held to, not the text it was typed as', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NumberField label="Horizon (years)" value={60} min={1} max={60} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'Horizon (years)' })
    await user.clear(input)
    await user.type(input, '100{Enter}')
    // The value did not change (60 was already the most), so nothing re-renders the box: it has to be told.
    expect(onChange).toHaveBeenCalledWith(60)
    expect(input).toHaveValue('60')
  })

  it('shows the value a percentage was held to', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PercentField label="Return (%/yr)" value={0.2} min={0} max={0.2} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'Return (%/yr)' })
    await user.clear(input)
    await user.type(input, '50{Enter}')
    expect(onChange).toHaveBeenCalledWith(0.2)
    expect(input).toHaveValue('20,0')
  })

  it.each(['1e9', '0x10', 'Infinity'])('takes %s for no number of years', async (typed) => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NumberField label="Horizon (years)" value={30} min={1} max={60} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'Horizon (years)' })
    await user.clear(input)
    await user.type(input, `${typed}{Enter}`)
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('30')
  })
})

describe('a comma typed into a field written with a decimal point', () => {
  const usd = { locale: 'en-US', symbol: '$', symbolPosition: 'prefix' as const, decimalSeparator: '.' }
  const inDollars = (ui: ReactElement) => (
    <MoneyFormatContext.Provider value={usd}>{ui}</MoneyFormatContext.Provider>
  )

  it('is the decimal mark of an amount, and three digits after it still make a thousand', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(inDollars(<MoneyField label="Rent (monthly)" value={100_000} onChange={onChange} />))
    const input = screen.getByRole('textbox', { name: 'Rent (monthly)' })

    await user.clear(input)
    await user.type(input, '12,5{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(1_250)

    await user.clear(input)
    await user.type(input, '1,500{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(150_000)
  })

  it('is the decimal mark of a percentage instead of making it 0%', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(inDollars(<PercentField label="Mortgage rate (%/yr)" value={0.035} onChange={onChange} />))
    const input = screen.getByRole('textbox', { name: 'Mortgage rate (%/yr)' })
    expect(input).toHaveValue('3.5')

    await user.clear(input)
    await user.type(input, '5,5{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(0.055)
  })
})

describe('fields holding a value the person did not type', () => {
  // A re-baselined house holds the loan as a fraction of a year left and a share that is no round number.
  it('does not rewrite a number of years that has a fraction when tabbed through', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NumberField label="Mortgage term (years)" value={22.5} decimals={2} min={1} max={40} onChange={onChange} />)

    await user.click(screen.getByRole('textbox', { name: 'Mortgage term (years)' }))
    await user.tab()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows a fraction of a year to two places, and steps by a whole year from it', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NumberField label="Mortgage term (years)" value={24.5833} decimals={2} min={1} max={40} onChange={onChange} />)

    expect(screen.getByRole('textbox', { name: 'Mortgage term (years)' })).toHaveValue('24,58')
    await user.click(screen.getByRole('button', { name: 'Increase Mortgage term (years)' }))
    expect(onChange).toHaveBeenLastCalledWith(25.58)
    await user.click(screen.getByRole('button', { name: 'Decrease Mortgage term (years)' }))
    expect(onChange).toHaveBeenLastCalledWith(23.58)
  })

  it('takes a fraction of a year that is typed, to the places it shows', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NumberField label="Mortgage term (years)" value={20} decimals={2} min={1} max={40} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'Mortgage term (years)' })
    await user.clear(input)
    await user.type(input, '22,567{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(22.57)
  })

  it('does not rewrite a percentage with more places than it shows when tabbed through', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PercentField label="Down payment" value={0.28769} max={1} onChange={onChange} />)

    await user.click(screen.getByRole('textbox', { name: 'Down payment' }))
    await user.tab()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('can go above half, when the field is given room for it', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PercentField label="Down payment" value={0.59} max={1} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Increase Down payment' }))
    expect(onChange).toHaveBeenLastCalledWith(0.595)
    expect(screen.getByRole('slider', { name: 'Down payment' })).toHaveAttribute('max', '1')
  })

  it('still takes a percentage that is typed over one it did not write', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PercentField label="Down payment" value={0.28769} max={1} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'Down payment' })
    await user.clear(input)
    await user.type(input, '30{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(0.3)
  })
})

