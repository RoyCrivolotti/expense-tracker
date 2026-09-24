import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CashReserveSetting } from './CashReserveSetting'
import { defaultExpenseSettings } from '../../engine'

describe('CashReserveSetting', () => {
  it('saves a whole number of months on blur, not per keystroke', () => {
    const onChange = vi.fn()
    render(<CashReserveSetting settings={{ ...defaultExpenseSettings(), cashReserveMonths: 3 }} onChange={onChange} />)
    const input = screen.getByLabelText('Months of spending to hold in cash')
    expect(input).toHaveValue(3)

    // Typing "12" over 3 passes through "1"; saving that would race the round trip.
    fireEvent.change(input, { target: { value: '1' } })
    fireEvent.change(input, { target: { value: '12' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith({ cashReserveMonths: 12 })
  })

  it('takes a value saved elsewhere over its own draft', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <CashReserveSetting settings={{ ...defaultExpenseSettings(), cashReserveMonths: 3 }} onChange={onChange} />,
    )
    const input = screen.getByLabelText('Months of spending to hold in cash')
    fireEvent.change(input, { target: { value: '9' } })
    rerender(<CashReserveSetting settings={{ ...defaultExpenseSettings(), cashReserveMonths: 4 }} onChange={onChange} />)
    expect(input).toHaveValue(4)
  })

  it('saves on Enter too', () => {
    const onChange = vi.fn()
    render(<CashReserveSetting settings={{ ...defaultExpenseSettings(), cashReserveMonths: 3 }} onChange={onChange} />)
    const input = screen.getByLabelText('Months of spending to hold in cash')
    fireEvent.change(input, { target: { value: '6' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith({ cashReserveMonths: 6 })
  })

  it('puts the saved value back for an empty field or anything outside the bound', () => {
    const onChange = vi.fn()
    render(<CashReserveSetting settings={{ ...defaultExpenseSettings(), cashReserveMonths: 3 }} onChange={onChange} />)
    const input = screen.getByLabelText('Months of spending to hold in cash')

    // Clearing the field must not quietly switch the target off.
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(input).toHaveValue(3)
    fireEvent.change(input, { target: { value: '99' } })
    fireEvent.blur(input)
    expect(input).toHaveValue(3)
    fireEvent.change(input, { target: { value: '2.5' } })
    fireEvent.blur(input)
    expect(input).toHaveValue(3)
    expect(onChange).not.toHaveBeenCalled()
  })
})
