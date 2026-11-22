import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultExpenseSettings } from '../../engine'
import { makeDataset, makeTransaction } from '../../testing/factories'
import type { ExpenseDataset } from '../../types'
import { makeActions } from '../../testing/makeActions'
import { setMotionDisabledForTests } from '../hooks/motion'
import { TipsProvider } from '../tips/TipsProvider'
import type { ExpenseModel } from '../useExpenseData'
import { Fields } from './TransactionFields'
import type { FormFields } from './transactionFormState'

vi.mock('../hooks/isNativeDatePicker', () => ({ isNativeDatePicker: () => true }))

const FIRST = 'Add your first transaction. An amount, a description and a category are enough. The rest can wait.'
const SAME_NAME = 'Use the same name each time for the same shop. Suggestions and Analytics group by it.'
const MONTH = 'Which month’s budget this counts in. Usually the month of the date.'
const INVEST = /Money you put into your investments/
const REFUND = /Money paid back for something you bought/
const WITHDRAW = /Money taken out of your investments/

function modelWith(
  count: number,
  exportAll?: number,
): ExpenseModel {
  const dataset: ExpenseDataset = makeDataset({
    categories: [{ id: 1, name: 'Groceries', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
    accounts: [{ id: 1, name: 'Main debit', kind: 'debit', settlement: 'immediate', active: true }],
    transactions: Array.from({ length: count }, (_, i) => makeTransaction({ id: i + 1 })),
    settings: defaultExpenseSettings(),
  })
  return {
    dataset,
    lookup: {
      category: () => undefined,
      account: () => undefined,
      categoryName: () => '',
      accountName: () => '',
      flag: () => undefined,
      label: () => undefined,
      attachments: () => [],
      attachmentCount: () => 0,
      installmentPlan: () => undefined,
      settlementFor: () => undefined,
      settledBy: () => [],
    },
    descriptionIndex: { search: () => [], resolve: () => undefined },
    months: ['2026-07'],
    ...(exportAll !== undefined ? { exportAll: { count: exportAll, read: () => Promise.resolve([]) } } : {}),
  }
}

const form = (over: Partial<FormFields> = {}): FormFields => ({
  type: 'expense',
  outflow: false,
  amount: '',
  description: '',
  categoryId: 1,
  accountId: 1,
  date: '2026-07-05',
  budgetMonth: '2026-07',
  notes: '',
  flagId: null,
  labelIds: [],
  ...over,
})

interface Opts {
  saved?: string[] | undefined
  canWrite?: boolean
  editing?: boolean
  form?: Partial<FormFields>
  model: ExpenseModel
}

function ui(opts: Opts) {
  const { canWrite = true, editing = false, form: over, model } = opts
  // `saved: undefined` is a column never written, which is not the same as the empty list of a new person.
  const saved = 'saved' in opts ? opts.saved : []
  return (
    <TipsProvider
      saved={saved}
      hasTransactions={model.dataset.transactions.length > 0}
      save={canWrite ? () => Promise.resolve() : undefined}
    >
      <Fields
        form={form(over)}
        set={vi.fn()}
        model={model}
        editing={editing ? makeTransaction({ id: 99 }) : null}
        onAcceptSuggestion={vi.fn()}
        actions={makeActions()}
      />
    </TipsProvider>
  )
}
const show = (o: Opts) => render(ui(o))

beforeEach(() => setMotionDisabledForTests(true))
afterEach(cleanup)

describe('the first-payment line', () => {
  it('shows on a new payment for an account with none', () => {
    show({ model: modelWith(0) })
    expect(screen.getByText(FIRST)).toBeInTheDocument()
  })
  it('is gone once the account has a payment', () => {
    show({ model: modelWith(1) })
    expect(screen.queryByText(FIRST)).toBeNull()
  })
  it('counts what a window says the account holds, not the few rows it has loaded', () => {
    show({ model: modelWith(0, 40) })
    expect(screen.queryByText(FIRST)).toBeNull()
  })
  it('is not on an edit', () => {
    show({ model: modelWith(0), editing: true })
    expect(screen.queryByText(FIRST)).toBeNull()
  })
  it('is not shown in a session that cannot write', () => {
    show({ model: modelWith(0), canWrite: false })
    expect(screen.queryByText(FIRST)).toBeNull()
  })
  it('folds away and is inert while it goes when the first payment is saved', () => {
    setMotionDisabledForTests(false)
    vi.useFakeTimers()
    try {
      const view = show({ model: modelWith(0) })
      view.rerender(ui({ model: modelWith(1) }))
      const line = screen.getByText(FIRST)
      expect(line.closest('[inert]')).not.toBeNull()
      act(() => void vi.advanceTimersByTime(100))
      expect(screen.queryByText(FIRST)).toBeInTheDocument()
      act(() => void vi.advanceTimersByTime(200))
      expect(screen.queryByText(FIRST)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('which tips the form lines follow', () => {
  it('is not switched off by putting the Getting started card away: only its own id counts', () => {
    show({ model: modelWith(0), saved: ['getting-started'] })
    expect(screen.getByText(FIRST)).toBeInTheDocument()
  })
})

describe('the description line', () => {
  it('shows through the ninth payment and leaves at ten', () => {
    show({ model: modelWith(9) })
    expect(screen.getByText(SAME_NAME)).toBeInTheDocument()
    cleanup()
    show({ model: modelWith(10) })
    expect(screen.queryByText(SAME_NAME)).toBeNull()
  })
  it('is not on an edit, where the field has no suggestions', () => {
    show({ model: modelWith(2), editing: true })
    expect(screen.queryByText(SAME_NAME)).toBeNull()
  })
  it('never shows to an established account (no saved list, with payments)', () => {
    show({ model: modelWith(3), saved: undefined })
    expect(screen.queryByText(SAME_NAME)).toBeNull()
  })
  it('shows again for an established account once the tips are brought back (an empty list)', () => {
    show({ model: modelWith(3), saved: [] })
    expect(screen.getByText(SAME_NAME)).toBeInTheDocument()
  })
})

describe('the budget month line', () => {
  it('shows when the budget month is not the date’s month, early on', () => {
    show({ model: modelWith(2), form: { date: '2026-07-31', budgetMonth: '2026-08' } })
    expect(screen.getByText(MONTH)).toBeInTheDocument()
  })
  it('is not on an edit', () => {
    show({ model: modelWith(2), editing: true, form: { date: '2026-07-31', budgetMonth: '2026-08' } })
    expect(screen.queryByText(MONTH)).toBeNull()
  })
  it('folds open when the budget month moves off the date’s month while the form is open', () => {
    setMotionDisabledForTests(false)
    const view = show({ model: modelWith(2) })
    view.rerender(ui({ model: modelWith(2), form: { date: '2026-07-31', budgetMonth: '2026-08' } }))
    expect(screen.getByText(MONTH).closest('[class*="arriving"]')).not.toBeNull()
  })
  it('never shows to an established account or in a session that cannot write', () => {
    const drift = { date: '2026-07-31', budgetMonth: '2026-08' }
    show({ model: modelWith(3), saved: undefined, form: drift })
    expect(screen.queryByText(MONTH)).toBeNull()
    cleanup()
    show({ model: modelWith(3), canWrite: false, form: drift })
    expect(screen.queryByText(MONTH)).toBeNull()
  })
  it('is absent when they match, and when the account has ten payments', () => {
    show({ model: modelWith(2) })
    expect(screen.queryByText(MONTH)).toBeNull()
    cleanup()
    show({ model: modelWith(10), form: { date: '2026-07-31', budgetMonth: '2026-08' } })
    expect(screen.queryByText(MONTH)).toBeNull()
  })
})

describe('the lines under the type buttons', () => {
  it('says what Invest and Refund are, as Withdraw does, for as long as the type is picked and whatever the account holds', () => {
    show({ model: modelWith(500), saved: undefined, form: { type: 'investment' } })
    expect(screen.getByText(INVEST)).toBeInTheDocument()
    cleanup()
    show({ model: modelWith(500), form: { type: 'refund' } })
    expect(screen.getByText(REFUND)).toBeInTheDocument()
    cleanup()
    show({ model: modelWith(500), form: { type: 'investment', outflow: true } })
    expect(screen.getByText(WITHDRAW)).toBeInTheDocument()
    expect(screen.queryByText(INVEST)).toBeNull()
  })
  it('adds no type line for Expense and Income', () => {
    show({ model: modelWith(0), form: { type: 'expense' } })
    expect(screen.queryByText(INVEST)).toBeNull()
    expect(screen.queryByText(REFUND)).toBeNull()
    expect(screen.queryByText(WITHDRAW)).toBeNull()
    cleanup()
    show({ model: modelWith(0), form: { type: 'income' } })
    expect(screen.getByText(FIRST)).toBeInTheDocument()
    expect(screen.getByText(SAME_NAME)).toBeInTheDocument()
    expect(screen.queryByText(INVEST)).toBeNull()
    expect(screen.queryByText(REFUND)).toBeNull()
  })

  it('folds a type line in and out, and keeps its words while it goes', () => {
    setMotionDisabledForTests(false)
    vi.useFakeTimers()
    try {
      const view = show({ model: modelWith(500), form: { type: 'expense' } })
      view.rerender(ui({ model: modelWith(500), form: { type: 'investment' } }))
      expect(screen.getByText(INVEST).closest('[class*="arriving"]')).not.toBeNull()
      view.rerender(ui({ model: modelWith(500), form: { type: 'expense' } }))
      const leaving = screen.getByText(INVEST)
      expect(leaving.closest('[inert]')).not.toBeNull()
      act(() => void vi.advanceTimersByTime(400))
      expect(screen.queryByText(INVEST)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
