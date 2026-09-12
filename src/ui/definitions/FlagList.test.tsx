import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset, Transaction } from '../../types'
import type { ExpenseActions } from '../actions'
import { makeDataset, makeFlag } from '../../testing/factories'
import { buildLookup } from '../format'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import type { ExpenseModel } from '../useExpenseData'
import { FlagList } from './FlagList'

const work = makeFlag({ id: 1, name: 'Work travel', description: 'Reimbursable' })

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
  flagId: 1,
}

function renderList(dataset: ExpenseDataset) {
  const model = { dataset, lookup: buildLookup(dataset), descriptionIndex: {}, months: [] } as unknown as ExpenseModel
  render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
      <FlagList model={model} actions={{ createFlag: vi.fn() } as unknown as ExpenseActions} />
    </MoneyFormatProvider>,
  )
}

describe('FlagList', () => {
  it('explains what flags do before any exist, and offers to add one', () => {
    renderList(makeDataset())

    expect(screen.getByText(/No flags yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add flag' })).toBeInTheDocument()
  })

  it('lists each flag with its description and usage', () => {
    renderList(makeDataset({ flags: [work], transactions: [tagged] }))

    expect(screen.getByText('Work travel')).toBeInTheDocument()
    expect(screen.getByText(/Reimbursable · 1 tagged/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Manage flags' })).toBeInTheDocument()
  })

  it('opens the manager', async () => {
    renderList(makeDataset({ flags: [work] }))

    await userEvent.click(screen.getByRole('button', { name: 'Manage flags' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
