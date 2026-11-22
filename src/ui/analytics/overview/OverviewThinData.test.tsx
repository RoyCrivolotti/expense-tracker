import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../../../types'
import { buildExpenseModel } from '../../buildExpenseModel'
import { makeDataset, makeTransaction } from '../../../testing/factories'
import { OverviewView } from './OverviewView'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  })
})

const PACE = 'Shows once your categories have monthly budgets.'
const ALLOC = 'Shows once this month has income.'
const MOVERS = 'Shows once there is an earlier month to compare with.'
const MOVERS_NONE = 'Nothing to compare: no flexible spending this month or in the months before.'
const FIXED = 'Shows once a charge repeats 3 times (monthly, every 3 months or yearly), or you have an instalment plan.'
const BASELINE = 'Shows once a month before this one has closed with spending.'

let nextId = 1
function txn(partial: Partial<Transaction>): Transaction {
  return makeTransaction({ id: nextId++, ...partial })
}

function view(transactions: Transaction[], month: string, withBudget = false) {
  const model = buildExpenseModel(
    makeDataset({
      categories: [
        { id: 1, name: 'Groceries', monthlyBudgetCents: withBudget ? 60_000 : 0, sortOrder: 0, active: true },
      ],
      transactions,
    }),
  )
  render(
    <OverviewView
      model={model}
      month={month}
      basis="paid"
      period="month"
      compare="prevMonth"
      today="2026-03-10"
      openMonth="2026-03"
      onSelectMonth={vi.fn()}
      onShowView={vi.fn()}
    />,
  )
}

const month = (m: string, extra: Partial<Transaction> = {}) => [
  txn({ date: `${m}-01`, budgetMonth: m, type: 'income', amountCents: 300_000, ...extra }),
  txn({ date: `${m}-04`, budgetMonth: m, categoryId: 1, amountCents: 40_000, ...extra }),
]

describe('Overview with thin data', () => {
  it('names what every card needs when there is nothing yet', () => {
    view([], '2026-03')
    expect(screen.getByText(PACE)).toBeInTheDocument()
    expect(screen.getByText(ALLOC)).toBeInTheDocument()
    expect(screen.getByText(MOVERS)).toBeInTheDocument()
    expect(screen.getByText(FIXED)).toBeInTheDocument()
    expect(screen.getByText(BASELINE)).toBeInTheDocument()
  })

  it('with one expense and no budget or income, the rest still waits', () => {
    view([txn({ date: '2026-03-04', budgetMonth: '2026-03', categoryId: 1, amountCents: 1_000 })], '2026-03')
    expect(screen.getByText(PACE)).toBeInTheDocument()
    expect(screen.getByText(ALLOC)).toBeInTheDocument()
    expect(screen.getByText(MOVERS)).toBeInTheDocument()
    expect(screen.getByText(BASELINE)).toBeInTheDocument()
  })

  it('with one full month, pace and income cards fill in but the comparing cards need a second month', () => {
    view(month('2026-02'), '2026-02', true)
    expect(screen.queryByText(PACE)).not.toBeInTheDocument()
    expect(screen.queryByText(ALLOC)).not.toBeInTheDocument()
    expect(screen.getByText(MOVERS)).toBeInTheDocument()
    expect(screen.getByText(BASELINE)).toBeInTheDocument()
    expect(screen.getByText(FIXED)).toBeInTheDocument()
  })

  it('with two months, the comparing cards have something to compare', () => {
    view([...month('2026-01'), ...month('2026-02')], '2026-02', true)
    expect(screen.queryByText(MOVERS)).not.toBeInTheDocument()
    expect(screen.queryByText(MOVERS_NONE)).not.toBeInTheDocument()
    expect(screen.queryByText(BASELINE)).not.toBeInTheDocument()
    expect(screen.getByText('Spending baseline')).toBeInTheDocument()
  })

  it('tells an earlier month with no flexible spending apart from having no earlier month', () => {
    view([txn({ date: '2026-01-01', budgetMonth: '2026-01', type: 'income', amountCents: 1_000 })], '2026-02')
    expect(screen.getByText(MOVERS_NONE)).toBeInTheDocument()
    expect(screen.queryByText(MOVERS)).not.toBeInTheDocument()
  })
})
