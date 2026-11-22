import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeDataset, makeFlag, makeTransaction } from '../../testing/factories'
import { setMotionDisabledForTests } from '../hooks/motion'
import { FlaggedCard } from '../tabs/FlaggedCard'
import { TransactionsTips } from './TransactionsTips'
import { TipsProvider } from './TipsProvider'
import { dashboardReady, open, sourceFor, storeWith, writesOf } from './tipsHarness'
import type { ExpenseModel } from '../useExpenseData'
import { buildLookup } from '../format'

const region = (name: string) => screen.queryByRole('region', { name })
const goTo = (tab: string) => fireEvent.click(screen.getAllByRole('button', { name: tab })[0]!)
/** The width the app reads: a phone is under 768px, and the harness's matchMedia says it is a computer. */
function setPhone(phone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: phone && query === '(max-width: 767px)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
}
afterEach(() => setPhone(false))
const got = () => fireEvent.click(screen.getByRole('button', { name: 'Got it' }))

describe('the Transactions card', () => {
  beforeEach(() => setMotionDisabledForTests(true))

  it('shows to a new person with a payment, and Got it saves it on the account so another device does not show it', async () => {
    const store = storeWith({ tipsSeen: ['getting-started'] })
    const source = sourceFor(store)
    const first = open(source)
    await dashboardReady()
    goTo('Transactions')
    expect(await screen.findByRole('region', { name: 'Transactions' })).toBeInTheDocument()

    got()

    expect(region('Transactions')).toBeNull()
    expect(writesOf(source)).toHaveBeenCalledWith({ tipsSeen: ['getting-started', 'transactions'] })
    await waitFor(() => expect(store.settings.tipsSeen).toContain('transactions'))
    first.unmount()
    cleanup()
    open(sourceFor(store))
    await dashboardReady()
    goTo('Transactions')
    await screen.findByText('Filters')
    expect(region('Transactions')).toBeNull()
  })

  it('stays until it is put away: leaving the tab and coming back does not mark it seen', async () => {
    open(sourceFor(storeWith({ tipsSeen: [] })))
    await dashboardReady()
    goTo('Transactions')
    await screen.findByRole('region', { name: 'Transactions' })
    goTo('Dashboard')
    goTo('Transactions')
    expect(await screen.findByRole('region', { name: 'Transactions' })).toBeInTheDocument()
  })

  it('does not show to an established account (no saved list, with payments)', async () => {
    open(sourceFor(storeWith()))
    await dashboardReady()
    goTo('Transactions')
    await screen.findByText('Filters')
    expect(region('Transactions')).toBeNull()
  })

  it('does not show while the account has no payment', async () => {
    open(sourceFor(storeWith({ tipsSeen: [] }), []))
    await dashboardReady()
    goTo('Transactions')
    await screen.findByText('Filters')
    expect(region('Transactions')).toBeNull()
  })

  it('shows nothing where nothing can be acted on', async () => {
    open(sourceFor(storeWith({ tipsSeen: [] }), [makeTransaction()], false))
    await dashboardReady()
    goTo('Transactions')
    await screen.findByText('Filters')
    expect(region('Transactions')).toBeNull()
  })

  it.each([
    [true, 'Tap a payment to change it. Swipe it left to copy or delete it.'],
    [false, 'Click a payment to change it.'],
  ])('on the real tab, speaks to a phone (%s) in its own words', async (phone, words) => {
    setPhone(phone)
    open(sourceFor(storeWith({ tipsSeen: [] })))
    await screen.findByText('Budgets')
    goTo('Transactions')
    expect(await screen.findByText(words)).toBeInTheDocument()
  })
})

describe('the Analytics card', () => {
  beforeEach(() => setMotionDisabledForTests(true))

  it('shows to a new person with data, and Got it saves it', async () => {
    const store = storeWith({ tipsSeen: [] })
    const source = sourceFor(store)
    open(source)
    await dashboardReady()
    goTo('Analytics')
    expect(await screen.findByRole('region', { name: 'Analytics' })).toBeInTheDocument()
    expect(
      screen.getByText(
        "Where the month's money went, by category, compared with last month, a three-month average or last year.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('It gets more useful after a couple of weeks of entries.')).toBeInTheDocument()

    got()

    expect(region('Analytics')).toBeNull()
    await waitFor(() => expect(store.settings.tipsSeen).toEqual(['analytics']))
  })

  it.each([
    [true, 'Open Spending, then tap a category to see the payments behind it.'],
    [false, 'Open Spending, then click a category to see the payments behind it.'],
  ])('speaks to a phone (%s) in its own words', async (phone, words) => {
    setPhone(phone)
    open(sourceFor(storeWith({ tipsSeen: [] })))
    await screen.findByText('Budgets')
    goTo('Analytics')
    expect(await screen.findByText(words)).toBeInTheDocument()
  })

  it('shows nothing where nothing can be acted on', async () => {
    open(sourceFor(storeWith({ tipsSeen: [] }), [makeTransaction()], false))
    await dashboardReady()
    goTo('Analytics')
    await screen.findByRole('tab', { name: 'Overview' })
    expect(region('Analytics')).toBeNull()
  })

  it('is not there with no data (the tab says so itself), nor for an established account', async () => {
    const empty = open(sourceFor(storeWith({ tipsSeen: [] }), []))
    await dashboardReady()
    goTo('Analytics')
    await screen.findByText(/No data yet/)
    expect(region('Analytics')).toBeNull()
    empty.unmount()
    cleanup()

    open(sourceFor(storeWith()))
    await dashboardReady()
    goTo('Analytics')
    await screen.findByRole('tab', { name: 'Overview' })
    expect(region('Analytics')).toBeNull()
  })
})

function modelOf(transactions: ReturnType<typeof makeTransaction>[]): ExpenseModel {
  const dataset = makeDataset({ transactions, flags: [makeFlag({ id: 7 })] })
  return {
    dataset,
    lookup: buildLookup(dataset),
    descriptionIndex: { search: () => [], resolve: () => undefined },
    months: transactions.length > 0 ? ['2025-01'] : [],
  }
}

const ui = (
  model: ExpenseModel,
  phone = false,
) => (
  <TipsProvider saved={[]} hasTransactions={model.months.length > 0} save={() => Promise.resolve()}>
    <TransactionsTips model={model} phone={phone} />
  </TipsProvider>
)

describe('the Transactions words and the Flagged line', () => {
  afterEach(cleanup)
  beforeEach(() => setMotionDisabledForTests(true))

  it('talks about tapping, swiping and holding on a phone, and clicking and Select on a computer', () => {
    const model = modelOf([makeTransaction()])
    const phone = render(ui(model, true))
    expect(screen.getByText('Tap a payment to change it. Swipe it left to copy or delete it.')).toBeInTheDocument()
    expect(screen.getByText('Hold one to select several and change them together.')).toBeInTheDocument()
    phone.unmount()
    render(ui(model, false))
    expect(screen.getByText('Click a payment to change it.')).toBeInTheDocument()
    expect(screen.getByText('Use Select to pick several and change them together.')).toBeInTheDocument()
    expect(screen.queryByText(/Swipe/)).toBeNull()
    expect(
      screen.getByText('Use Filters to find payments by category, account, flag, label or amount.'),
    ).toBeInTheDocument()
  })

  const flagged = (model: ExpenseModel) => (
    <TipsProvider saved={[]} hasTransactions save={() => Promise.resolve()}>
      <FlaggedCard
        model={model}
        onFilterByFlag={() => undefined}
        onOpenReport={() => undefined}
        onSettle={() => undefined}
        onManage={() => undefined}
      />
    </TipsProvider>
  )

  it('says what Flagged is for under its heading, only once a flagged payment exists, and then folds open', () => {
    setMotionDisabledForTests(false)
    const view = render(flagged(modelOf([makeTransaction()])))
    expect(region('Flagged payments')).toBeNull()
    expect(screen.queryByText('Flagged')).toBeNull()

    act(() => view.rerender(flagged(modelOf([makeTransaction({ id: 2, flagId: 7 })]))))

    const card = screen.getByRole('region', { name: 'Flagged payments' })
    expect(card.closest('[class*="arriving"]')).not.toBeNull()
    expect(
      screen.getByText('Flagged payments collect here. Use Expense report to turn them into a document you can send.'),
    ).toBeInTheDocument()
    // Under the heading it describes, and above the card it is about.
    const heading = screen.getByText('Flagged')
    expect(heading.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      card.compareDocumentPosition(screen.getByText(/items? across/)) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})

describe('putting the Flagged line away', () => {
  beforeEach(() => setMotionDisabledForTests(true))

  it('saves its own id and leaves the Transactions card where it is', async () => {
    const store = storeWith({ tipsSeen: ['getting-started'] })
    const source = sourceFor(store, [makeTransaction({ flagId: 1 })], true, [makeFlag({ id: 1 })])
    open(source)
    await dashboardReady()
    goTo('Transactions')
    const line = await screen.findByRole('region', { name: 'Flagged payments' })

    fireEvent.click(within(line).getByRole('button', { name: 'Got it' }))

    expect(region('Flagged payments')).toBeNull()
    expect(region('Transactions')).toBeInTheDocument()
    expect(writesOf(source)).toHaveBeenCalledWith({ tipsSeen: ['getting-started', 'flagged'] })
  })
})
