import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeLookup, makeTransaction } from '../../testing/factories'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import { TransactionRowBody } from './TransactionRowBody'

function renderRow(count: number) {
  render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
      <TransactionRowBody txn={makeTransaction({ id: 4 })} lookup={makeLookup({ attachmentCount: () => count })} />
    </MoneyFormatProvider>,
  )
}

describe('TransactionRowBody, the receipt mark', () => {
  it('shows how many receipts the transaction has, from the count, whether or not the list was read', () => {
    renderRow(3)
    expect(screen.getByRole('img', { name: '3 receipts' })).toBeInTheDocument()
  })

  it('says receipt, not receipts, for one', () => {
    renderRow(1)
    expect(screen.getByRole('img', { name: '1 receipt' })).toBeInTheDocument()
  })

  it('shows no mark for none', () => {
    renderRow(0)
    expect(screen.queryByRole('img', { name: /receipt/ })).toBeNull()
  })
})
