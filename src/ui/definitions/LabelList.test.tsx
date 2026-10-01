import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset, Transaction } from '../../types'
import type { ExpenseActions } from '../actions'
import { makeDataset, makeLabel } from '../../testing/factories'
import { buildLookup } from '../format'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import type { ExpenseModel } from '../useExpenseData'
import { LabelList } from './LabelList'

const trip = makeLabel({ id: 1, name: 'Japan trip', description: 'Spring 2027' })

const tagged: Transaction = {
  id: 1,
  date: '2026-05-01',
  budgetMonth: '2026-05',
  description: 'Hotel',
  accountId: 1,
  categoryId: 1,
  type: 'expense',
  amountCents: 1_000,
  cancelled: false,
  status: 'posted',
  labelIds: [1],
}

function renderList(dataset: ExpenseDataset) {
  const model = { dataset, lookup: buildLookup(dataset), descriptionIndex: {}, months: [] } as unknown as ExpenseModel
  render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
      <LabelList model={model} actions={{ createLabel: vi.fn() } as unknown as ExpenseActions} />
    </MoneyFormatProvider>,
  )
}

describe('LabelList', () => {
  it('explains what labels do before any exist, and offers to add one', () => {
    renderList(makeDataset())

    expect(screen.getByText(/No labels yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add label' })).toBeInTheDocument()
  })

  it('lists each label with its description and usage', () => {
    renderList(makeDataset({ labels: [trip], transactions: [tagged] }))

    expect(screen.getByText('Japan trip')).toBeInTheDocument()
    expect(screen.getByText(/Spring 2027 · 1 tagged/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Manage labels' })).toBeInTheDocument()
  })

  it('opens the manager', async () => {
    renderList(makeDataset({ labels: [trip] }))

    await userEvent.click(screen.getByRole('button', { name: 'Manage labels' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
