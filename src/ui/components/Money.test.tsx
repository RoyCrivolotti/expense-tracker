import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import { Money } from './Money'

function renderMoney(cents: number, type: 'investment' | 'expense' | 'income' | 'refund') {
  render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
      <Money cents={cents} type={type} />
    </MoneyFormatProvider>,
  )
}

describe('Money', () => {
  it('reads money put into the portfolio as a debit and money taken out as a credit', () => {
    renderMoney(50_000, 'investment')
    expect(screen.getByText(/500,00/)).toHaveTextContent(/^−500,00/)
  })

  it('reads a withdrawal with a plus', () => {
    renderMoney(-50_000, 'investment')
    expect(screen.getByText(/500,00/)).toHaveTextContent(/^\+500,00/)
  })
})
