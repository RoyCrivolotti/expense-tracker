import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../../types'
import type { TransactionListRow } from '../../engine'
import { buildLookup } from '../format'
import { makeDataset } from '../../testing/factories'
import { applyJx } from '../debug/jitterFlags'
import { TransactionList } from './TransactionList'

const lookup = buildLookup(
  makeDataset({
    categories: [
      { id: 1, name: 'Investments', monthlyBudgetCents: 0, sortOrder: 0, active: true },
    ],
    accounts: [
      { id: 1, name: 'Santander Debit', kind: 'debit', settlement: 'immediate', active: true },
    ],
  }),
)

function txn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 1,
    date: '2026-07-15',
    budgetMonth: '2026-07',
    description: 'Degiro',
    accountId: 1,
    categoryId: 1,
    type: 'investment',
    amountCents: 250_000,
    cancelled: false,
    status: 'posted',
    ...overrides,
  }
}

function rows(...transactions: Transaction[]): TransactionListRow[] {
  return transactions.map((t) => ({ kind: 'transaction' as const, txn: t }))
}

describe('TransactionList budget month pill', () => {
  it('labels every row of a single-month list, even where the dates agree with it', () => {
    render(
      <TransactionList
        rows={rows(
          txn({ id: 1, date: '2026-07-15', budgetMonth: '2026-07' }),
          txn({ id: 2, date: '2026-07-20', budgetMonth: '2026-07' }),
        )}
        lookup={lookup}
      />,
    )
    expect(screen.getAllByText("Jul '26")).toHaveLength(2)
  })

  it('labels every row once the list mixes budget months', () => {
    render(
      <TransactionList
        rows={rows(
          txn({ id: 1, date: '2026-07-15', budgetMonth: '2026-07' }),
          txn({ id: 2, date: '2026-06-10', budgetMonth: '2026-06' }),
        )}
        lookup={lookup}
      />,
    )
    expect(screen.getByText("Jul '26")).toBeTruthy()
    expect(screen.getByText("Jun '26")).toBeTruthy()
  })

  it('keeps the amount and both badges in the right rail, off the meta line', () => {
    render(<TransactionList rows={rows(txn({ status: 'forecast' }))} lookup={lookup} />)
    const rail = screen.getByText("Jul '26").closest<HTMLElement>('[class*="amountRail"]')
    expect(rail).toContainElement(screen.getByText(/2\.500,00/))
    expect(rail).toContainElement(screen.getByText('Forecast'))
    expect(rail).not.toContainElement(screen.getByText('Investments · Santander Debit'))
  })

  it('names the budget month, not the calendar month the date falls in', () => {
    render(
      <TransactionList
        rows={rows(txn({ date: '2026-07-31', budgetMonth: '2026-08' }))}
        lookup={lookup}
      />,
    )
    expect(screen.getByText("Aug '26")).toHaveAttribute('title', 'Budget month: August 2026')
    expect(screen.queryByText("Jul '26")).toBeNull()
  })

  it('labels rows in the flat layout too, as the dashboard recent-activity list uses', () => {
    render(
      <TransactionList
        rows={rows(
          txn({ id: 1, date: '2026-07-15', budgetMonth: '2026-07' }),
          txn({ id: 2, date: '2026-06-10', budgetMonth: '2026-06' }),
        )}
        lookup={lookup}
        flat
        showDate
      />,
    )
    expect(screen.getByText("Jul '26")).toBeTruthy()
    expect(screen.getByText("Jun '26")).toBeTruthy()
  })

  it('leaves statement-payment rows alone, since they spell their month out already', () => {
    render(
      <TransactionList
        rows={[
          { kind: 'transaction', txn: txn({ date: '2026-07-15', budgetMonth: '2026-07' }) },
          {
            kind: 'statement-payment',
            key: '2:2026-06',
            date: '2026-06-15',
            budgetMonth: '2026-06',
            cardAccountId: 2,
            debitAccountId: 1,
            amountCents: 137_345,
            cardName: 'Iberia Icon',
          },
        ]}
        lookup={lookup}
      />,
    )
    expect(screen.getAllByText("Jul '26")).toHaveLength(1)
    expect(screen.queryByText("Jun '26")).toBeNull()
    expect(screen.getByText(/June 2026/)).toBeTruthy()
  })
})

describe('TransactionList collapsible date groups', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("hides a day's rows on toggle but keeps its header", async () => {
    render(<TransactionList rows={rows(txn({ id: 1, description: 'Degiro' }))} lookup={lookup} />)
    expect(screen.getByText('Degiro')).toBeVisible()

    await userEvent.click(screen.getByRole('button', { expanded: true }))
    expect(screen.getByText('Degiro')).not.toBeVisible()
    expect(screen.getByRole('button', { expanded: false })).toBeVisible()
  })

  it('expands again on a second toggle', async () => {
    render(<TransactionList rows={rows(txn({ id: 1, description: 'Degiro' }))} lookup={lookup} />)
    await userEvent.click(screen.getByRole('button', { expanded: true }))
    await userEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText('Degiro')).toBeVisible()
  })

  it('collapsing one day leaves a different day expanded', async () => {
    render(
      <TransactionList
        rows={rows(
          txn({ id: 1, date: '2026-07-16', description: 'Later txn' }),
          txn({ id: 2, date: '2026-07-15', description: 'Earlier txn' }),
        )}
        lookup={lookup}
      />,
    )
    const toggles = screen.getAllByRole('button', { expanded: true })
    expect(toggles).toHaveLength(2)

    await userEvent.click(toggles[0]!)
    expect(screen.getByText('Later txn')).not.toBeVisible()
    expect(screen.getByText('Earlier txn')).toBeVisible()
  })

  it("lets the add button open its own flow without toggling collapse", async () => {
    const onAddForDate = vi.fn()
    render(
      <TransactionList
        rows={rows(txn({ id: 1, description: 'Degiro' }))}
        lookup={lookup}
        onAddForDate={onAddForDate}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /^Add transaction/ }))
    expect(onAddForDate).toHaveBeenCalledWith('2026-07-15')
    expect(screen.getByText('Degiro')).toBeVisible()
  })

  it("keeps the day select-all control and its indicator working while collapsed", async () => {
    const onToggleDate = vi.fn()
    const { container } = render(
      <TransactionList
        rows={rows(txn({ id: 1 }))}
        lookup={lookup}
        selectMode
        selectedIds={new Set([1])}
        onToggleDate={onToggleDate}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /^Collapse/ }))
    const dayHeader = container.querySelector('[data-state]')
    expect(dayHeader).toHaveAttribute('data-state', 'all')

    const daySelectBtn = container.querySelector<HTMLButtonElement>('[class*="daySelectBtn"]')
    await userEvent.click(daySelectBtn!)
    expect(onToggleDate).toHaveBeenCalledWith([1])
  })

  it('remembers a collapsed day across remounts', async () => {
    const ui = <TransactionList rows={rows(txn({ id: 1, description: 'Degiro' }))} lookup={lookup} />
    const { unmount } = render(ui)
    await userEvent.click(screen.getByRole('button', { expanded: true }))
    expect(screen.getByText('Degiro')).not.toBeVisible()
    unmount()

    render(ui)
    expect(screen.getByText('Degiro')).not.toBeVisible()
  })
})

describe('TransactionList jitter lab', () => {
  afterEach(() => applyJx([]))

  function swipeList() {
    return (
      <TransactionList
        rows={rows(txn())}
        lookup={lookup}
        swipeDelete
        onDelete={vi.fn()}
        onLongPressSelect={vi.fn()}
      />
    )
  }

  it('wraps rows in the swipe container by default', () => {
    const { container } = render(swipeList())
    expect(container.querySelector('[class*="swipeSlide"]')).not.toBeNull()
  })

  it('renders plain rows with no swipe wrapper when the lab asks for them', () => {
    applyJx(['plainRows'])
    const { container } = render(swipeList())
    expect(container.querySelector('[class*="swipeSlide"]')).toBeNull()
  })
})
