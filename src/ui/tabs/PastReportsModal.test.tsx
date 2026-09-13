import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../../types'
import { makeDataset, makeFlag, makeLookup, makeTransaction } from '../../testing/factories'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import type { ExpenseModel } from '../useExpenseData'
import { PastReportsModal } from './PastReportsModal'

const WORK = makeFlag({ id: 4, name: 'Work travel' })

function modelWith(transactions: Transaction[]): ExpenseModel {
  const dataset = makeDataset({ flags: [WORK], transactions })
  return {
    dataset,
    lookup: makeLookup(),
    descriptionIndex: { search: () => [], resolve: () => undefined },
    months: [],
  }
}

function renderModal(transactions: Transaction[]) {
  const onOpenReport = vi.fn()
  const onOpenPayment = vi.fn()
  render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
      <PastReportsModal
        model={modelWith(transactions)}
        onClose={vi.fn()}
        onOpenReport={onOpenReport}
        onOpenPayment={onOpenPayment}
      />
    </MoneyFormatProvider>,
  )
  return { onOpenReport, onOpenPayment }
}

const settled = [
  makeTransaction({ id: 1, flagId: 4, settledBy: 99, amountCents: 10_000 }),
  makeTransaction({ id: 2, flagId: 4, settledBy: 99, amountCents: 4_000 }),
  makeTransaction({
    id: 99,
    type: 'refund',
    date: '2026-06-14',
    amountCents: 14_000,
    description: 'Alicante expenses, September 2026',
  }),
]

describe('PastReportsModal', () => {
  it('lists a settled report under the name you gave the payment', () => {
    renderModal(settled)

    expect(screen.getByText('Alicante expenses, September 2026')).toBeInTheDocument()
    expect(screen.getByText(/2 transactions/)).toBeInTheDocument()
  })

  it('reopens the report as it was when it was settled', async () => {
    const { onOpenReport } = renderModal(settled)

    await userEvent.click(screen.getByRole('button', { name: 'Report' }))

    expect(onOpenReport).toHaveBeenCalledWith(99)
  })

  it('opens the payment itself', async () => {
    const { onOpenPayment } = renderModal(settled)

    await userEvent.click(screen.getByRole('button', { name: 'Payment' }))

    expect(onOpenPayment).toHaveBeenCalledWith(expect.objectContaining({ id: 99 }))
  })

  it('says what it is waiting for when nothing has been reimbursed', () => {
    renderModal([makeTransaction({ id: 1, flagId: 4 })])

    expect(screen.getByText(/once you record the reimbursement/i)).toBeInTheDocument()
  })
})
