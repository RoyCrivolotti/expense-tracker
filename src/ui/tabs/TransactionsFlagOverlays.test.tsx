import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeDataset, makeFlag, makeTransaction } from '../../testing/factories'
import { makeActions } from '../../testing/makeActions'
import type { ExpenseDataset, Transaction } from '../../types'
import { buildExpenseModel } from '../buildExpenseModel'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import { EXIT_MS, setMotionDisabledForTests } from '../hooks/motion'
import { TransactionsFlagOverlays } from './TransactionsFlagOverlays'

type Props = ComponentProps<typeof TransactionsFlagOverlays>

const WORK = makeFlag({ id: 1, name: 'Work travel' })

const hotel = (overrides: Partial<Transaction> = {}) =>
  makeTransaction({
    id: 1,
    flagId: 1,
    description: 'Hotel Lisboa',
    date: '2026-05-02',
    budgetMonth: '2026-05',
    ...overrides,
  })

/** An open claim: one flagged expense, still owed. */
const OPEN = makeDataset({ flags: [WORK], transactions: [hotel()] })

/** The same claim once paid: the expense points at the refund that settled it. */
const SETTLED = makeDataset({
  flags: [WORK],
  transactions: [
    hotel({ settledBy: 99 }),
    makeTransaction({
      id: 99,
      type: 'refund',
      date: '2026-06-14',
      amountCents: 19_840,
      description: 'Lisbon trip paid back',
    }),
  ],
})

const withMoney = (props: Props) => (
  <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
    <TransactionsFlagOverlays {...props} />
  </MoneyFormatProvider>
)

/** Everything closed unless `overrides` opens it. `update` changes props on the same mount. */
function renderOverlays(dataset: ExpenseDataset, overrides: Partial<Props> = {}) {
  const callbacks = {
    onCloseReport: vi.fn(),
    onOpenReport: vi.fn(),
    onClosePast: vi.fn(),
    onCloseManage: vi.fn(),
    onCloseViewPast: vi.fn(),
    onOpenPastReport: vi.fn(),
  }
  const actions = makeActions()
  const props: Props = {
    model: buildExpenseModel(dataset),
    actions,
    reportFlagId: null,
    pastPaymentId: null,
    managingFlags: false,
    viewingPast: false,
    ...callbacks,
    ...overrides,
  }
  const { rerender } = render(withMoney(props))
  return { ...callbacks, actions, update: (next: Partial<Props>) => rerender(withMoney({ ...props, ...next })) }
}

const backButton = () => screen.queryByRole('button', { name: 'Back' })

describe('TransactionsFlagOverlays', () => {
  it('shows nothing until one of its overlays is asked for', () => {
    renderOverlays(SETTLED)

    expect(backButton()).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('needs write access to open either list, since both lead to editing', () => {
    renderOverlays(SETTLED, { actions: undefined, viewingPast: true, managingFlags: true })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('TransactionsFlagOverlays with an open claim', () => {
  it('shows the report for the flag and closes it from Back', async () => {
    const { onCloseReport } = renderOverlays(OPEN, { reportFlagId: 1 })

    expect(screen.getByRole('heading', { name: 'Work travel' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(onCloseReport).toHaveBeenCalledTimes(1)
  })

  it('shows nothing for a flag with nothing left to claim', () => {
    renderOverlays(makeDataset({ flags: [WORK] }), { reportFlagId: 1 })

    expect(backButton()).not.toBeInTheDocument()
  })
})

describe('TransactionsFlagOverlays with a past report', () => {
  it('rebuilds the report the payment settled and closes it from Back', async () => {
    const { onClosePast, onCloseReport } = renderOverlays(SETTLED, { pastPaymentId: 99 })

    // The row is settled, so an open report for the same flag would not list it.
    expect(within(screen.getByRole('table')).getByText('Hotel Lisboa')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(onClosePast).toHaveBeenCalledTimes(1)
    expect(onCloseReport).not.toHaveBeenCalled()
  })

  it('shows nothing for a payment that settled nothing', () => {
    renderOverlays(SETTLED, { pastPaymentId: 12 })

    expect(backButton()).not.toBeInTheDocument()
  })
})

describe('TransactionsFlagOverlays with a line that has no receipt', () => {
  // Each report overlay hands the editor over on its own, so both are checked.
  const REPORTS = [
    ['an open claim', OPEN, { reportFlagId: 1 }],
    ['a past report', SETTLED, { pastPaymentId: 99 }],
  ] as const

  it.each(REPORTS)('opens the transaction for editing from %s', async (_name, dataset, overrides) => {
    const { actions } = renderOverlays(dataset, overrides)

    await userEvent.click(screen.getByRole('button', { name: /Hotel Lisboa/ }))

    expect(actions.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })

  it.each(REPORTS)('leaves it alone in %s without write access', (_name, dataset, overrides) => {
    renderOverlays(dataset, { ...overrides, actions: undefined })

    expect(screen.getByText(/1 item has no receipt attached/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Hotel Lisboa/ })).not.toBeInTheDocument()
  })
})

describe('TransactionsFlagOverlays past reports list', () => {
  it('lists what has been paid back and closes from Close', async () => {
    const { onCloseViewPast } = renderOverlays(SETTLED, { viewingPast: true })

    expect(screen.getByRole('dialog', { name: 'Past expense reports' })).toBeInTheDocument()
    expect(screen.getByText('Lisbon trip paid back')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onCloseViewPast).toHaveBeenCalledTimes(1)
  })

  it('reopens a report, and opens its payment for editing', async () => {
    const { onOpenPastReport, actions } = renderOverlays(SETTLED, { viewingPast: true })

    await userEvent.click(screen.getByRole('button', { name: 'Report' }))
    await userEvent.click(screen.getByRole('button', { name: 'Payment' }))

    expect(onOpenPastReport).toHaveBeenCalledWith(99)
    expect(actions.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 99 }))
  })
})

describe('TransactionsFlagOverlays flag manager', () => {
  it('lists the flags and closes from Close', async () => {
    const { onCloseManage } = renderOverlays(OPEN, { managingFlags: true })

    expect(screen.getByRole('dialog', { name: 'Flags' })).toBeInTheDocument()
    expect(screen.getByText('Work travel')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onCloseManage).toHaveBeenCalledTimes(1)
  })

  it('opens the report for a flag, closing itself first', async () => {
    const { onCloseManage, onOpenReport } = renderOverlays(OPEN, { managingFlags: true })

    await userEvent.click(screen.getByRole('button', { name: 'Expense report' }))

    expect(onCloseManage).toHaveBeenCalledTimes(1)
    expect(onOpenReport).toHaveBeenCalledWith(1)
  })

  it('edits through the actions it was given', async () => {
    const { actions } = renderOverlays(OPEN, { managingFlags: true })

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save flag' }))

    expect(actions.updateFlag).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Work travel' }))
  })
})

describe('TransactionsFlagOverlays leaving', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setMotionDisabledForTests(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    setMotionDisabledForTests(true)
  })

  it('keeps a report on screen while it fades, then removes it', () => {
    const { update } = renderOverlays(OPEN, { reportFlagId: 1 })

    update({ reportFlagId: null })
    expect(screen.getByRole('heading', { name: 'Work travel' })).toBeInTheDocument()

    void act(() => vi.advanceTimersByTime(EXIT_MS.fade))
    expect(screen.queryByRole('heading', { name: 'Work travel' })).not.toBeInTheDocument()
  })

  it('keeps a sheet on screen while it slides down, then removes it', () => {
    const { update } = renderOverlays(OPEN, { managingFlags: true })

    update({ managingFlags: false })
    expect(screen.getByRole('dialog', { name: 'Flags' })).toBeInTheDocument()

    void act(() => vi.advanceTimersByTime(EXIT_MS.sheet))
    expect(screen.queryByRole('dialog', { name: 'Flags' })).not.toBeInTheDocument()
  })
})
