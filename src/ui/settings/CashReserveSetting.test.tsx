import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CashReserveSetting } from './CashReserveSetting'
import { defaultExpenseSettings } from '../../engine'

describe('CashReserveSetting', () => {
  it('saves a whole number of months and ignores anything outside the bound', () => {
    const onChange = vi.fn()
    render(<CashReserveSetting settings={{ ...defaultExpenseSettings(), cashReserveMonths: 3 }} onChange={onChange} />)
    const input = screen.getByLabelText('Months of spending to hold in cash')
    expect(input).toHaveValue(3)

    fireEvent.change(input, { target: { value: '6' } })
    expect(onChange).toHaveBeenLastCalledWith({ cashReserveMonths: 6 })

    fireEvent.change(input, { target: { value: '99' } })
    fireEvent.change(input, { target: { value: '2.5' } })
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
