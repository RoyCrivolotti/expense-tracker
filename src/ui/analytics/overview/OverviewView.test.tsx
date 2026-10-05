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
      openMonth="2026-03"
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

  it('says the open month\'s income split is through the same days as the headline numbers', () => {
    renderView()
    expect(screen.getByText(/income in the first 10 days/)).toBeTruthy()
  })

  it('calls a closed month\'s income split a whole month', () => {
    renderView({ month: '2026-02', openMonth: '2026-03' })
    expect(screen.getByText(/income this month/)).toBeTruthy()
  })

  it('says the baseline is a trailing average over the history there is, not a year to date', () => {
    renderView()
    expect(screen.getByText(/of\s+history before this one, up to 12\. A trailing average, not a calendar year/)).toBeTruthy()
    expect(screen.getByText(/Annual spend at FI/)).toBeTruthy()
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

  it('selects the clicked trend month, mapped through the svg itself', () => {
    // Pointer capture retargets clicks to the svg, so the svg maps x to a month.
    // jsdom has no CTM; an identity transform stands in for it.
    const { onSelectMonth } = renderView()
    const svg = screen.getByRole('img', { name: 'Spending bars and income line by month' })
    Object.assign(svg, {
      getScreenCTM: () => ({ inverse: () => 'identity' }),
      createSVGPoint: () => {
        const pt = { x: 0, y: 0, matrixTransform: () => ({ x: pt.x, y: pt.y }) }
        return pt
      },
    })
    fireEvent.click(svg, { clientX: 0 })
    expect(onSelectMonth).toHaveBeenCalledWith('2025-12')
  })

  it('selects the keyboard-focused trend month with Enter', () => {
    const { onSelectMonth } = renderView()
    const svg = screen.getByRole('img', { name: 'Spending bars and income line by month' })
    fireEvent.keyDown(svg, { key: 'ArrowRight' })
    fireEvent.keyDown(svg, { key: 'Enter' })
    expect(onSelectMonth).toHaveBeenCalledWith('2025-12')
  })

  it('opens the monthly totals table on demand', () => {
    renderView()
    expect(screen.queryByText('Net saving')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    expect(screen.getByText('Net saving')).toBeTruthy()
  })

  it('marks the income of a lone month with a dot, since one point draws no line', () => {
    const oneMonth = buildExpenseModel(
      makeDataset({
        transactions: [
          txn({ date: '2026-03-01', budgetMonth: '2026-03', type: 'income', description: 'Payroll', amountCents: 300_000 }),
        ],
      }),
    )
    renderView({ model: oneMonth })
    const svg = screen.getByRole('img', { name: 'Spending bars and income line by month' })
    expect(svg.querySelectorAll('circle')).toHaveLength(1)
  })
})
