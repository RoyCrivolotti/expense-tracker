import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset, Transaction } from '../../types'
import { makeAttachment, makeDataset, makeFlag } from '../../testing/factories'
import { buildLookup } from '../format'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import { ReimbursementPackView } from './ReimbursementPackView'

const work = makeFlag({ id: 1, name: 'Work travel', description: 'Reimbursable — submit monthly' })

function txn(id: number, date: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    date,
    budgetMonth: date.slice(0, 7),
    description: `Txn ${id}`,
    accountId: 1,
    categoryId: 1,
    type: 'expense',
    amountCents: 10_000,
    cancelled: false,
    status: 'posted',
    flagId: 1,
    ...overrides,
  }
}

function renderPack(dataset: ExpenseDataset, flagId = 1) {
  const onClose = vi.fn()
  render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
      <ReimbursementPackView
        dataset={dataset}
        lookup={buildLookup(dataset)}
        flagId={flagId}
        onClose={onClose}
      />
    </MoneyFormatProvider>,
  )
  return { onClose }
}

function datasetWith(transactions: Transaction[], attachments: unknown[] = []): ExpenseDataset {
  return makeDataset({ flags: [work], transactions, attachments: attachments as never })
}

describe('ReimbursementPackView', () => {
  it('heads the claim with the flag, its note and the date range', () => {
    renderPack(datasetWith([txn(1, '2026-05-02'), txn(2, '2026-05-09')]))

    expect(screen.getByRole('heading', { name: 'Work travel' })).toBeInTheDocument()
    expect(screen.getByText('Reimbursable — submit monthly')).toBeInTheDocument()
    expect(screen.getByText(/2 May.*9 May.*2 items/)).toBeInTheDocument()
  })

  it('lists one row per transaction, oldest first', () => {
    renderPack(
      datasetWith([
        txn(1, '2026-05-09', { description: 'Taxi' }),
        txn(2, '2026-05-02', { description: 'Hotel' }),
      ]),
    )

    const rows = screen.getAllByRole('row').slice(1, 3)
    expect(within(rows[0]!).getByText('Hotel')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('Taxi')).toBeInTheDocument()
  })

  it('shows the total the claim adds up to', () => {
    renderPack(datasetWith([txn(1, '2026-05-02'), txn(2, '2026-05-09')]))

    expect(screen.getByText('Total claimed')).toBeInTheDocument()
    expect(screen.getByText('200,00 €')).toBeInTheDocument()
  })

  it('warns about lines with no receipt, which is what gets a claim sent back', () => {
    renderPack(datasetWith([txn(1, '2026-05-02'), txn(2, '2026-05-09')], [makeAttachment({ id: 5, transactionId: 1 })]))

    expect(screen.getByText(/1 item has no receipt attached/)).toBeInTheDocument()
  })

  it('says nothing about receipts when every line has one', () => {
    renderPack(datasetWith([txn(1, '2026-05-02')], [makeAttachment({ id: 5, transactionId: 1 })]))

    expect(screen.queryByText(/no receipt attached/)).not.toBeInTheDocument()
  })

  it('prints each receipt full size, captioned with its transaction', () => {
    renderPack(
      datasetWith([txn(1, '2026-05-02', { description: 'Hotel' })], [
        makeAttachment({ id: 5, transactionId: 1 }),
      ]),
    )

    expect(screen.getByRole('img', { name: 'Receipt for Hotel' })).toHaveAttribute(
      'src',
      '/api/expenses/attachments/5',
    )
    expect(screen.getByText(/2 May.*Hotel.*100,00/)).toBeInTheDocument()
  })

  it('tells the user to attach a PDF separately rather than pretending to print it', () => {
    renderPack(
      datasetWith([txn(1, '2026-05-02')], [
        makeAttachment({ id: 5, transactionId: 1, contentType: 'application/pdf', hasThumb: false, originalName: 'invoice.pdf' }),
      ]),
    )

    expect(screen.getByText(/attach/)).toBeInTheDocument()
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument()
  })

  it('writes a refund as a negative, so it does not read as another expense', () => {
    renderPack(datasetWith([txn(1, '2026-05-02', { type: 'refund', amountCents: 4_000 })]))

    // The row and the total, since a refund is the only line here.
    expect(screen.getAllByText('-40,00 €')).toHaveLength(2)
  })

  it('renders nothing for a flag with nothing to claim', () => {
    const { container } = render(
      <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
        <ReimbursementPackView
          dataset={makeDataset({ flags: [work] })}
          lookup={buildLookup(makeDataset({ flags: [work] }))}
          flagId={1}
          onClose={vi.fn()}
        />
      </MoneyFormatProvider>,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('flags the body while open so the print rule can hide the app behind it', () => {
    const { unmount } = render(
      <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
        <ReimbursementPackView
          dataset={datasetWith([txn(1, '2026-05-02')])}
          lookup={buildLookup(datasetWith([txn(1, '2026-05-02')]))}
          flagId={1}
          onClose={vi.fn()}
        />
      </MoneyFormatProvider>,
    )

    expect(document.body.dataset.packOpen).toBe('true')

    unmount()

    expect(document.body.dataset.packOpen).toBeUndefined()
  })

  it('prints on request', async () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)
    renderPack(datasetWith([txn(1, '2026-05-02')]))

    await userEvent.click(screen.getByRole('button', { name: /Print or save as PDF/ }))

    expect(print).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('closes', async () => {
    const { onClose } = renderPack(datasetWith([txn(1, '2026-05-02')]))

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(onClose).toHaveBeenCalled()
  })
})
