import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../../../types'
import { buildExpenseModel } from '../../buildExpenseModel'
import { makeDataset, makeLabel, makeTransaction } from '../../../testing/factories'
import { presetFor } from './presetFor'
import { SpendingView } from './SpendingView'

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

function model() {
  return buildExpenseModel(
    makeDataset({
      categories: [
        { id: 1, name: 'Groceries', monthlyBudgetCents: 40_000, sortOrder: 0, active: true },
        { id: 2, name: 'Dining', monthlyBudgetCents: 0, sortOrder: 1, active: true },
      ],
      labels: [makeLabel({ id: 1, name: 'Porto trip' })],
      transactions: [
        txn({ date: '2026-02-05', budgetMonth: '2026-02', categoryId: 1, description: 'shop feb', amountCents: 30_000 }),
        txn({ date: '2026-03-05', budgetMonth: '2026-03', categoryId: 1, description: 'big shop', amountCents: 25_000 }),
        txn({ date: '2026-03-08', budgetMonth: '2026-03', categoryId: 2, description: 'dinner', amountCents: 8_000, labelIds: [1] }),
      ],
    }),
  )
}

function renderView() {
  const onOpenTransactions = vi.fn()
  render(
    <SpendingView model={model()} month="2026-03" basis="committed" onOpenTransactions={onOpenTransactions} />,
  )
  return { onOpenTransactions }
}

describe('SpendingView', () => {
  it('ranks the rows and opens a detail pane with the deep link into Transactions', () => {
    const { onOpenTransactions } = renderView()
    const rows = screen.getAllByRole('button', { expanded: false })
    expect(rows[0]?.textContent).toContain('Groceries')

    fireEvent.click(screen.getByRole('button', { name: /Groceries/ }))
    expect(screen.getByText('Biggest this month')).toBeInTheDocument()
    expect(screen.getByText('big shop')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open in Transactions' }))
    expect(onOpenTransactions).toHaveBeenCalledWith({ categoryId: 1, month: '2026-03' })
  })

  it('regroups by label, counting only labelled spend', () => {
    renderView()
    fireEvent.click(screen.getByRole('radio', { name: 'Label' }))
    expect(screen.getByText('Porto trip')).toBeInTheDocument()
    expect(screen.queryByText('Groceries')).toBeNull()
  })

  it('keeps the exact grid one tap away', () => {
    renderView()
    fireEvent.click(screen.getByRole('radio', { name: 'Grid' }))
    expect(screen.getByText('YTD (2026)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument()
  })
})

describe('presetFor', () => {
  it('maps groupings to filter presets, and none for fixed/flexible', () => {
    const base = { key: '7', name: 'Market Hall', currentCents: 0, unpaidCents: 0, budgetCents: null, shouldBeTodayCents: null, spark: [], avg3Cents: null, txnCount: 0 }
    expect(presetFor('category', base, '2026-03')).toEqual({ categoryId: 7, month: '2026-03' })
    expect(presetFor('label', base, '2026-03')).toEqual({ labelIds: [7], month: '2026-03' })
    expect(presetFor('merchant', base, '2026-03')).toEqual({ query: 'Market Hall', month: '2026-03' })
    expect(presetFor('fixedFlexible', base, '2026-03')).toBeNull()
  })
})
