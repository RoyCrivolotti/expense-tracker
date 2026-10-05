import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../../../types'
import { buildExpenseModel } from '../../buildExpenseModel'
import { makeDataset, makeScenario, makeTransaction } from '../../../testing/factories'
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

let nextId = 1
function txn(partial: Partial<Transaction>): Transaction {
  return makeTransaction({ id: nextId++, ...partial })
}

/** Four months of income, rent (recurring → fixed), groceries, investing; March open. */
function model() {
  const transactions: Transaction[] = []
  for (const m of ['2025-12', '2026-01', '2026-02', '2026-03']) {
    transactions.push(
      txn({ date: `${m}-01`, budgetMonth: m, type: 'income', description: 'Payroll', amountCents: 300_000 }),
      txn({ date: `${m}-01`, budgetMonth: m, description: 'Rent', categoryId: 1, amountCents: 100_000 }),
      txn({ date: `${m}-04`, budgetMonth: m, description: `Shop ${m}`, categoryId: 2, amountCents: 40_000 }),
      txn({ date: `${m}-03`, budgetMonth: m, type: 'investment', description: 'Fund', amountCents: 50_000 }),
    )
  }
  // An unpaid card charge in March, for the hatched cap and the committed basis.
  transactions.push(
    txn({ date: '2026-03-02', budgetMonth: '2026-03', description: 'Gadget', categoryId: 2, amountCents: 10_000, status: 'forecast' }),
  )
  return buildExpenseModel(
    makeDataset({
      categories: [
        { id: 1, name: 'Home', monthlyBudgetCents: 100_000, sortOrder: 0, active: true },
        { id: 2, name: 'Groceries', monthlyBudgetCents: 60_000, sortOrder: 1, active: true },
      ],
      goalScenarios: [makeScenario({ id: 1, isActive: true, annualSpendCents: 18_000_000 })],
      transactions,
    }),
  )
}

function renderView(overrides: Partial<Parameters<typeof OverviewView>[0]> = {}) {
  const onSelectMonth = vi.fn()
  const onShowView = vi.fn()
  render(
    <OverviewView
      model={model()}
      month="2026-03"
      basis="committed"
      period="month"
      compare="prevMonth"
      today="2026-03-10"
      onSelectMonth={onSelectMonth}
      onShowView={onShowView}
      {...overrides}
    />,
  )
  return { onSelectMonth, onShowView }
}

describe('OverviewView', () => {
  it('shows the five KPI tiles with the same-days note for the open month', () => {
    renderView()
    // getAllByText: the legacy Insights legend repeats some labels until PR 6 removes it.
    for (const label of ['Income', 'Spent', 'Net saved', 'Savings rate', 'Invested']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
    expect(screen.getByText(/first 10 days of last month/)).toBeTruthy()
  })

  it('shows pace, allocation, movers and the baseline with the Goals plan beside it', () => {
    renderView()
    expect(screen.getByText('Flexible spending pace')).toBeTruthy()
    expect(screen.getByText('Where the income went')).toBeTruthy()
    expect(screen.getByText('What changed')).toBeTruthy()
    expect(screen.getByText('Spending baseline')).toBeTruthy()
    expect(screen.getByText('Goals plan assumes')).toBeTruthy()
  })

  it('routes a signal action to the view it names', () => {
    const { onShowView } = renderView()
    fireEvent.click(screen.getByRole('button', { name: 'See the month' }))
    expect(onShowView).toHaveBeenCalledWith('spending')
  })

  it('hands the measured baseline to Goals when asked', () => {
    const onUseBaselineInGoals = vi.fn()
    renderView({ onUseBaselineInGoals })
    fireEvent.click(screen.getByRole('button', { name: 'Use in Goals' }))
    expect(onUseBaselineInGoals).toHaveBeenCalledWith(expect.any(Number))
  })

  it('opens the monthly totals table on demand', () => {
    renderView()
    expect(screen.queryByText('Net saving')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    expect(screen.getByText('Net saving')).toBeTruthy()
  })
})
