import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset, Transaction } from '../../types'
import { makeDataset, makeFlag } from '../../testing/factories'
import { buildLookup } from '../format'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import type { ExpenseModel } from '../useExpenseData'
import { FlaggedCard } from './FlaggedCard'

const work = makeFlag({ id: 1, name: 'Work travel', description: 'Reimbursable', sortOrder: 0 })
const tax = makeFlag({ id: 2, name: 'Tax deductible', color: '#10b981', sortOrder: 1 })

let seq = 0
function txn(overrides: Partial<Transaction> = {}): Transaction {
  seq += 1
  return {
    id: seq,
    date: '2026-05-01',
    budgetMonth: '2026-05',
    description: 'Hotel',
    accountId: 1,
    categoryId: 1,
    type: 'expense',
    amountCents: 10_000,
    cancelled: false,
    status: 'posted',
    ...overrides,
  }
}

function modelFor(dataset: ExpenseDataset): ExpenseModel {
  return {
    dataset,
    lookup: buildLookup(dataset),
    descriptionIndex: { search: () => [], resolve: () => undefined },
    months: [],
  }
}

function renderCard(dataset: ExpenseDataset) {
  const onFilterByFlag = vi.fn()
  const onManage = vi.fn()
  const onOpenPack = vi.fn()
  render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
      <FlaggedCard
        model={modelFor(dataset)}
        onFilterByFlag={onFilterByFlag}
        onOpenPack={onOpenPack}
        onManage={onManage}
      />
    </MoneyFormatProvider>,
  )
  return { onFilterByFlag, onManage, onOpenPack }
}

describe('FlaggedCard', () => {
  it('renders nothing when nothing is flagged', () => {
    const { container } = render(
      <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
        <FlaggedCard
          model={modelFor(makeDataset({ flags: [work] }))}
          onFilterByFlag={vi.fn()}
          onOpenPack={vi.fn()}
          onManage={vi.fn()}
        />
      </MoneyFormatProvider>,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('shows one group per flag with its count and description', () => {
    renderCard(
      makeDataset({
        flags: [work, tax],
        transactions: [txn({ flagId: 1 }), txn({ flagId: 1 }), txn({ flagId: 2 })],
      }),
    )

    expect(screen.getByText('Work travel')).toBeInTheDocument()
    expect(screen.getByText('Reimbursable')).toBeInTheDocument()
    expect(screen.getByText('2 items')).toBeInTheDocument()
    expect(screen.getByText('1 item')).toBeInTheDocument()
  })

  it('starts collapsed, so it costs one row above the month\u2019s transactions', () => {
    renderCard(makeDataset({ flags: [work], transactions: [txn({ flagId: 1 })] }))

    expect(screen.getByText('Work travel')).not.toBeVisible()
  })

  it('rolls every flag up into one line while collapsed', () => {
    renderCard(
      makeDataset({
        flags: [work, tax],
        transactions: [
          txn({ flagId: 1, amountCents: 10_000 }),
          txn({ flagId: 2, amountCents: 5_000 }),
        ],
      }),
    )

    // The question the feature exists for is the cross-flag total; before this
    // the user had to add the per-flag figures themselves.
    expect(screen.getByText('2 items across 2 flags')).toBeVisible()
    expect(screen.getByText('150,00 €')).toBeVisible()
  })

  it('says it is not scoped to the selected month', () => {
    // Every sibling card on this tab is month-scoped and the header above reads
    // a single month, so the card has to declare that it is not.
    renderCard(makeDataset({ flags: [work], transactions: [txn({ flagId: 1 })] }))

    expect(screen.getByText(/All months, not just this one/)).toBeVisible()
  })

  it('keeps a group collapsed until it is opened', async () => {
    renderCard(makeDataset({ flags: [work], transactions: [txn({ flagId: 1, description: 'Madrid hotel' })] }))

    await userEvent.click(screen.getByText(/across 1 flag/))
    expect(screen.queryByText('Madrid hotel')).not.toBeVisible()

    await userEvent.click(screen.getByText('Work travel'))

    expect(screen.getByText('Madrid hotel')).toBeVisible()
  })

  it('leaves an archived flag out, which is how a settled claim stops nagging', () => {
    const { container } = render(
      <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
        <FlaggedCard
          model={modelFor(makeDataset({ flags: [{ ...work, active: false }], transactions: [txn({ flagId: 1 })] }))}
          onFilterByFlag={vi.fn()}
          onOpenPack={vi.fn()}
          onManage={vi.fn()}
        />
      </MoneyFormatProvider>,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('asks to filter the list to a flag', async () => {
    const { onFilterByFlag } = renderCard(
      makeDataset({ flags: [work], transactions: [txn({ flagId: 1 })] }),
    )

    await userEvent.click(screen.getByText(/across 1 flag/))
    await userEvent.click(screen.getByText('Work travel'))
    await userEvent.click(screen.getByRole('button', { name: /Show these in the list/ }))

    expect(onFilterByFlag).toHaveBeenCalledWith(1)
  })

  it('offers to see all of a long group, naming the real total', async () => {
    const many = Array.from({ length: 8 }, () => txn({ flagId: 1 }))
    renderCard(makeDataset({ flags: [work], transactions: many }))

    await userEvent.click(screen.getByText(/across 1 flag/))
    await userEvent.click(screen.getByText('Work travel'))

    expect(screen.getByRole('button', { name: /See all 8 in the list/ })).toBeInTheDocument()
  })

  it('opens the flag manager', async () => {
    const { onManage } = renderCard(
      makeDataset({ flags: [work], transactions: [txn({ flagId: 1 })] }),
    )

    await userEvent.click(screen.getByText(/across 1 flag/))
    await userEvent.click(screen.getByRole('button', { name: 'Manage flags' }))

    expect(onManage).toHaveBeenCalled()
  })

  it('ignores a transaction whose flag no longer exists', () => {
    const { container } = render(
      <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
        <FlaggedCard
          model={modelFor(makeDataset({ flags: [], transactions: [txn({ flagId: 99 })] }))}
          onFilterByFlag={vi.fn()}
          onOpenPack={vi.fn()}
          onManage={vi.fn()}
        />
      </MoneyFormatProvider>,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('opens the claim pack for a flag', async () => {
    const { onOpenPack } = renderCard(
      makeDataset({ flags: [work], transactions: [txn({ flagId: 1 })] }),
    )

    await userEvent.click(screen.getByText(/across 1 flag/))
    await userEvent.click(screen.getByText('Work travel'))
    await userEvent.click(screen.getByRole('button', { name: 'View claim' }))

    expect(onOpenPack).toHaveBeenCalledWith(1)
  })
})
