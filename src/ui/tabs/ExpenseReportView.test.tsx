import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset, Transaction } from '../../types'
import { makeAttachment, makeDataset, makeFlag } from '../../testing/factories'
import { buildLookup } from '../format'
import { Presence } from '../components/Presence'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import { EXIT_MS, setMotionDisabledForTests } from '../hooks/motion'
import { deliverReceipts } from '../../data/receiptDownload'
import { ExpenseReportView } from './ExpenseReportView'

vi.mock('../../data/receiptDownload', () => ({ deliverReceipts: vi.fn() }))

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

function renderPack(
  dataset: ExpenseDataset,
  flagId = 1,
  extra: { onOpenTransaction?: (txn: Transaction) => void } = {},
) {
  const onClose = vi.fn()
  render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
      <ExpenseReportView
        dataset={dataset}
        lookup={buildLookup(dataset)}
        flagId={flagId}
        onClose={onClose}
        issuedOn="2026-09-12"
        {...extra}
      />
    </MoneyFormatProvider>,
  )
  return { onClose }
}

function datasetWith(transactions: Transaction[], attachments: unknown[] = []): ExpenseDataset {
  return makeDataset({ flags: [work], transactions, attachments: attachments as never })
}

describe('ExpenseReportView', () => {
  it('heads the report with the flag, its note and the claimed period', () => {
    renderPack(datasetWith([txn(1, '2026-05-02'), txn(2, '2026-05-09')]))

    expect(screen.getByRole('heading', { name: 'Work travel' })).toBeInTheDocument()
    expect(screen.getByText('Reimbursable — submit monthly')).toBeInTheDocument()
    expect(screen.getByText('Expense report')).toBeInTheDocument()
    expect(screen.getByText(/2 May.*9 May/)).toBeInTheDocument()
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

    expect(screen.getByText('Total expenses')).toBeInTheDocument()
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

  it('names the PDF and ties it to the numbered line rather than pretending to print it', () => {
    renderPack(
      datasetWith([txn(1, '2026-05-02')], [
        makeAttachment({ id: 5, transactionId: 1, contentType: 'application/pdf', hasThumb: false, originalName: 'invoice.pdf' }),
      ]),
    )

    // The filename is what an approver matches against the separately-sent file,
    // and the R-number is what ties it back to a row in the table.
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument()
    expect(screen.getByText(/cannot be drawn into this page/)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Receipt for/ })).not.toBeInTheDocument()
  })

  it('points at the screenshot route, which needs no PDF engine to work', () => {
    renderPack(
      datasetWith([txn(1, '2026-05-02')], [
        makeAttachment({ id: 5, transactionId: 1, contentType: 'application/pdf', hasThumb: false, originalName: 'invoice.pdf' }),
      ]),
    )

    // Receipts already accept image/png, so this is a route that exists today
    // rather than a promise about a future feature.
    expect(screen.getByText(/screenshot of it, attached as an image/)).toBeInTheDocument()
  })

  it('offers a PDF receipt as a link, since the page cannot show it', () => {
    renderPack(
      datasetWith([txn(1, '2026-05-02')], [
        makeAttachment({ id: 5, transactionId: 1, contentType: 'application/pdf', hasThumb: false, originalName: 'invoice.pdf' }),
      ]),
    )

    const link = screen.getByRole('link', { name: 'Open R1' })
    expect(link).toHaveAttribute('href', '/api/expenses/attachments/5')
    // Opened out of the report rather than navigating away from it — the sheet
    // holds unsaved nothing, but it is mid-task and printing is the next step.
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('shows a recorded reimbursement as a credit under the claim, not a claimed line', () => {
    renderPack(
      datasetWith([
        txn(1, '2026-05-02', { amountCents: 10_000 }),
        txn(2, '2026-06-14', { type: 'refund', amountCents: 4_000 }),
      ]),
    )

    // Claimed stays gross — a claim you submit must not net itself down by a
    // payment you are still waiting for.
    expect(screen.getByText('Already reimbursed')).toBeInTheDocument()
    // The row and the claimed total both read 100,00 €; the outstanding figure
    // is the one that has to differ.
    expect(screen.getAllByText('100,00 €')).toHaveLength(2)
    expect(screen.getByText('Total expenses')).toBeInTheDocument()
    expect(screen.getByText('Outstanding')).toBeInTheDocument()
    expect(screen.getByText('60,00 €')).toBeInTheDocument()
    // Likewise the credit row and the "Less reimbursed" line.
    expect(screen.getAllByText('-40,00 €')).toHaveLength(2)
  })

  it('renders nothing for a flag with nothing to claim', () => {
    const { container } = render(
      <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
        <ExpenseReportView
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
        <ExpenseReportView
          dataset={datasetWith([txn(1, '2026-05-02')])}
          lookup={buildLookup(datasetWith([txn(1, '2026-05-02')]))}
          flagId={1}
          onClose={vi.fn()}
        />
      </MoneyFormatProvider>,
    )

    expect(document.body.dataset.reportOpen).toBe('true')

    unmount()

    expect(document.body.dataset.reportOpen).toBeUndefined()
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

  it('downloads the claim as a CSV', async () => {
    renderPack(datasetWith([txn(1, '2026-05-02')]))

    // Spied after render: React calls document.createElement too, and a
    // mockReturnValueOnce set up earlier is consumed by the first <div> it makes.
    const createObjectURL = vi.fn(() => 'blob:x')
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() })
    const anchor = document.createElement('a')
    vi.spyOn(anchor, 'click').mockImplementation(() => {})
    vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor)

    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }))

    expect(createObjectURL).toHaveBeenCalled()
    expect(anchor.download).toBe('work-travel-2026-05.csv')

    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
})

describe('ExpenseReportView — the document', () => {
  it('prints the claimant, reference, issue date and currency', () => {
    const dataset = makeDataset({
      flags: [work],
      transactions: [txn(1, '2026-05-02')],
      settings: { ...makeDataset().settings, claimantName: 'Alex Moreno', currencyCode: 'EUR' },
    })
    renderPack(dataset)

    expect(screen.getByText('Alex Moreno')).toBeInTheDocument()
    // Derived from the flag and the first claimed month, so a reprint matches.
    expect(screen.getByText('WT-202605')).toBeInTheDocument()
    expect(screen.getByText(/12 Sep/)).toBeInTheDocument()
    expect(screen.getByText(/EUR/)).toBeInTheDocument()
  })

  it('omits the claimant line rather than printing a blank one', () => {
    renderPack(datasetWith([txn(1, '2026-05-02')]))

    expect(screen.queryByText('Claimant')).not.toBeInTheDocument()
  })

  it('prints the transaction notes as the line’s business purpose', () => {
    renderPack(datasetWith([txn(1, '2026-05-02', { notes: 'Kick-off with Acme' })]))

    expect(screen.getByText('Kick-off with Acme')).toBeInTheDocument()
  })

  it('cross-references each receipt so a row can be tied to its figure', () => {
    renderPack(
      datasetWith(
        [txn(1, '2026-05-02'), txn(2, '2026-05-04')],
        [
          makeAttachment({ id: 1, transactionId: 1 }),
          makeAttachment({ id: 2, transactionId: 1 }),
          makeAttachment({ id: 3, transactionId: 2 }),
        ],
      ),
    )

    // The row carries the refs; each figure below repeats its own.
    expect(screen.getByText('R1 R2')).toBeInTheDocument()
    expect(screen.getAllByText('R3')).toHaveLength(2)
  })

  it('lets a line with no receipt be opened from the warning', async () => {
    const onOpenTransaction = vi.fn()
    renderPack(datasetWith([txn(1, '2026-05-02', { description: 'Hotel Lisboa' })]), 1, {
      onOpenTransaction,
    })

    // This is the route for rows entered through bulk-add, which has no per-row
    // receipt affordance of its own.
    await userEvent.click(screen.getByRole('button', { name: /Hotel Lisboa/ }))

    expect(onOpenTransaction).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })

  it('still renders for an archived flag, so a settled claim can be reprinted', () => {
    const archived = makeFlag({ id: 1, name: 'Work travel', active: false })
    renderPack(makeDataset({ flags: [archived], transactions: [txn(1, '2026-05-02')] }))

    expect(screen.getByRole('heading', { name: 'Work travel' })).toBeInTheDocument()
  })
})

describe('ExpenseReportView — sending the receipts on their own', () => {
  it('hands every receipt over, named and in a folder for the claim', async () => {
    const user = userEvent.setup()
    vi.mocked(deliverReceipts).mockResolvedValue('shared')
    renderPack(
      datasetWith(
        [txn(1, '2026-08-19', { description: 'Tren por trabajo', amountCents: 17_526 })],
        [makeAttachment({ id: 5, transactionId: 1, contentType: 'image/jpeg' })],
      ),
    )

    await user.click(screen.getByRole('button', { name: 'Send receipts' }))

    expect(deliverReceipts).toHaveBeenCalledWith(
      [{ attachmentId: 5, filename: 'R1 - 2026-08-19 - Tren por trabajo - 175,26 €.jpg' }],
      'Work travel 2026-08 receipts',
    )
  })

  it('falls back to the category name when a line has no description', async () => {
    const user = userEvent.setup()
    vi.mocked(deliverReceipts).mockResolvedValue('zipped')
    renderPack(
      datasetWith(
        [txn(1, '2026-08-19', { description: '', amountCents: 17_526 })],
        [makeAttachment({ id: 5, transactionId: 1, contentType: 'image/jpeg' })],
      ),
    )

    await user.click(screen.getByRole('button', { name: 'Send receipts' }))
    // Whatever the table prints for that row is what the file is called.
    const [named] = vi.mocked(deliverReceipts).mock.calls.at(-1)!
    expect(named[0]!.filename).not.toContain(' -  - ')
  })

  it('disables itself, with a reason, when nothing is attached', () => {
    renderPack(datasetWith([txn(1, '2026-08-19')], []))
    const button = screen.getByRole('button', { name: 'No receipts attached to this report' })
    expect(button).toBeDisabled()
  })

  it('surfaces a failure instead of appearing to do nothing', async () => {
    const user = userEvent.setup()
    vi.mocked(deliverReceipts).mockRejectedValue(new Error('Could not load receipt 5'))
    renderPack(
      datasetWith([txn(1, '2026-08-19')], [makeAttachment({ id: 5, transactionId: 1 })]),
    )

    await user.click(screen.getByRole('button', { name: 'Send receipts' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load receipt 5')
  })

  it('stays quiet when the share sheet is dismissed', async () => {
    const user = userEvent.setup()
    // AbortError is what the share sheet raises on cancel. Reporting it as a
    // failure would tell the user something broke when they simply backed out.
    const abort = new Error('share cancelled')
    abort.name = 'AbortError'
    vi.mocked(deliverReceipts).mockRejectedValue(abort)
    renderPack(
      datasetWith([txn(1, '2026-08-19')], [makeAttachment({ id: 5, transactionId: 1 })]),
    )

    await user.click(screen.getByRole('button', { name: 'Send receipts' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('ExpenseReportView — reopening a past report', () => {
  const payment = (overrides: Partial<Transaction> = {}) =>
    txn(99, '2026-06-14', {
      type: 'refund',
      amountCents: 20_000,
      description: 'Alicante expenses',
      ...overrides,
    })

  function renderPast(transactions: Transaction[]) {
    const dataset = datasetWith(transactions)
    render(
      <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
        <ExpenseReportView
          dataset={dataset}
          lookup={buildLookup(dataset)}
          settledByPaymentId={99}
          onClose={vi.fn()}
          issuedOn="2026-09-12"
        />
      </MoneyFormatProvider>,
    )
  }

  it('warns that a reprint will not match what was submitted', () => {
    // Recorded as 2 rows totalling 20,000; one was deleted afterwards.
    renderPast([
      txn(1, '2026-05-02', { settledBy: 99 }),
      payment({ reportCount: 2, reportCoveredCents: 20_000 }),
    ])

    expect(screen.getByText(/have changed since this report was sent/i)).toBeInTheDocument()
  })

  it('stays quiet when the covered rows still match', () => {
    renderPast([
      txn(1, '2026-05-02', { settledBy: 99 }),
      payment({ reportCount: 1, reportCoveredCents: 10_000 }),
    ])

    expect(screen.queryByText(/have changed since this report was sent/i)).not.toBeInTheDocument()
  })

  it('stays quiet on an open claim, which has nothing submitted to differ from', () => {
    renderPack(datasetWith([txn(1, '2026-05-02')]))

    expect(screen.queryByText(/have changed since this report was sent/i)).not.toBeInTheDocument()
  })
})

describe('ExpenseReportView leaving', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setMotionDisabledForTests(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    setMotionDisabledForTests(true)
  })

  const tree = (show: boolean) => {
    const dataset = datasetWith([txn(1, '2026-05-02')])
    return (
      <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
        <Presence show={show} exitMs={EXIT_MS.fade}>
          <ExpenseReportView dataset={dataset} lookup={buildLookup(dataset)} flagId={1} onClose={vi.fn()} issuedOn="2026-09-12" />
        </Presence>
      </MoneyFormatProvider>
    )
  }

  it('fades out over the time it is held for, taking no taps meanwhile, then goes', () => {
    const { rerender } = render(tree(true))
    const overlay = screen.getByRole('button', { name: 'Back' }).closest<HTMLElement>('[class*="overlay"]')!
    expect(overlay.className).not.toContain('overlayLeaving')

    rerender(tree(false))

    expect(overlay.className).toContain('overlayLeaving')
    expect(overlay.hasAttribute('inert')).toBe(true)
    expect(overlay.style.getPropertyValue('--exit-ms')).toBe(`${EXIT_MS.fade}ms`)

    void act(() => vi.advanceTimersByTime(EXIT_MS.fade))
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('releases the print flag when it has gone, so the app prints again', () => {
    const { rerender } = render(tree(true))
    expect(document.body.dataset.reportOpen).toBe('true')

    rerender(tree(false))
    void act(() => vi.advanceTimersByTime(EXIT_MS.fade))

    expect(document.body.dataset.reportOpen).toBeUndefined()
  })
})
