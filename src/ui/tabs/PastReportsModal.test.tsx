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

describe('PastReportsModal — a report whose rows have changed', () => {
  /** The same report, but the payment carries the figures the settle stamped on it. */
  const stampedSettled = (count: number, coveredCents: number) =>
    settled.map((t) =>
      t.id === 99 ? { ...t, reportCount: count, reportCoveredCents: coveredCents } : t,
    )

  it('shows what was submitted and says the rows no longer match', () => {
    // Recorded as 3 rows totalling 20,000; only two rows worth 14,000 remain.
    renderModal(stampedSettled(3, 20_000))

    expect(screen.getByText(/3 transactions/)).toBeInTheDocument()
    expect(screen.getByText(/have changed since you sent this/i)).toBeInTheDocument()
  })

  it('says nothing when the rows still match', () => {
    renderModal(stampedSettled(2, 14_000))

    expect(screen.queryByText(/have changed since you sent this/i)).not.toBeInTheDocument()
  })

  it('says nothing for a payment recorded before snapshots existed', () => {
    renderModal(settled)

    expect(screen.queryByText(/have changed since you sent this/i)).not.toBeInTheDocument()
  })
})

describe('PastReportsModal — nothing left of a report', () => {
  const orphaned = [
    {
      ...settled[2]!,
      reportCount: 2,
      reportCoveredCents: 37_800,
    },
  ]

  it('still lists it, with the figures that were submitted', () => {
    renderModal(orphaned)

    expect(screen.getByText('Alicante expenses, September 2026')).toBeInTheDocument()
    expect(screen.getByText(/2 transactions/)).toBeInTheDocument()
    expect(screen.getByText(/none of the transactions this covered are still here/i))
      .toBeInTheDocument()
  })

  it('offers the payment but not a report there is nothing to rebuild', () => {
    renderModal(orphaned)

    expect(screen.getByRole('button', { name: 'Payment' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Report' })).not.toBeInTheDocument()
  })
})
