import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../../types'
import type { TransactionListRow } from '../../engine'
import { buildLookup } from '../format'
import { setMotionDisabledForTests } from '../hooks/motion'
import { WINDOW_FROM_ROWS } from '../hooks/windowLayout'
import { makeDataset } from '../../testing/factories'
import { TransactionList } from './TransactionList'

const lookup = buildLookup(
  makeDataset({
    categories: [{ id: 1, name: 'Food', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
    accounts: [{ id: 1, name: 'Debit', kind: 'debit', settlement: 'immediate', active: true }],
  }),
)

function day(offset: number): string {
  return new Date(Date.UTC(2030, 0, 1) - offset * 86_400_000).toISOString().slice(0, 10)
}

/** `count` rows, newest first, `perDay` to a day. Row n is described as "Txn n". */
function ledger(count: number, perDay = 10): TransactionListRow[] {
  return Array.from({ length: count }, (_, i): TransactionListRow => {
    const date = day(Math.floor(i / perDay))
    const txn: Transaction = {
      id: i + 1,
      date,
      budgetMonth: date.slice(0, 7),
      description: `Txn ${i + 1}`,
      accountId: 1,
      categoryId: 1,
      type: 'expense',
      amountCents: 1000,
      cancelled: false,
      status: 'posted',
    }
    return { kind: 'transaction', txn }
  })
}

/**
 * jsdom lays nothing out. The list asks where it is on the page (to know what is on screen) and
 * the rows how tall they are, so both are faked: `scrollTo` moves the list up the screen, and a
 * row is `rowHeight` tall.
 */
let listTop = 0
let rowHeight = 0

function scrollTo(y: number) {
  listTop = -y
  act(() => {
    window.dispatchEvent(new Event('scroll'))
  })
}

function rendered(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-vrow]'), (el) => Number(el.dataset.vrow))
}

beforeEach(() => {
  listTop = 0
  rowHeight = 0
  localStorage.clear()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const top = this.className.includes('listWindowed') ? listTop : 0
    const height = this.hasAttribute('data-vrow') ? rowHeight : 0
    return { top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top, toJSON: () => ({}) }
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  setMotionDisabledForTests(true)
})

describe('TransactionList above the windowing threshold', () => {
  it('renders a short list whole, as it always was', () => {
    const { container } = render(<TransactionList rows={ledger(WINDOW_FROM_ROWS)} lookup={lookup} />)
    expect(rendered(container)).toEqual([])
    expect(screen.getByText('Txn 1')).toBeInTheDocument()
    expect(screen.getByText(`Txn ${WINDOW_FROM_ROWS}`)).toBeInTheDocument()
  })

  it('renders only the rows near the screen once it is longer', () => {
    const { container } = render(<TransactionList rows={ledger(WINDOW_FROM_ROWS + 1)} lookup={lookup} />)
    const keys = rendered(container)
    expect(keys.length).toBeGreaterThan(10)
    expect(keys.length).toBeLessThan(80)
    expect(screen.getByText('Txn 1')).toBeInTheDocument()
    expect(screen.queryByText(`Txn ${WINDOW_FROM_ROWS + 1}`)).toBeNull()
  })

  it('does not window a flat list however long', () => {
    const { container } = render(<TransactionList rows={ledger(WINDOW_FROM_ROWS * 2)} lookup={lookup} flat />)
    expect(rendered(container)).toEqual([])
    expect(screen.getByText(`Txn ${WINDOW_FROM_ROWS * 2}`)).toBeInTheDocument()
  })
})

describe('TransactionList windowed', () => {
  const rows = ledger(3000)

  it('keeps every day one group whose header is its first child, so the header sticks', () => {
    const { container } = render(<TransactionList rows={rows} lookup={lookup} />)
    const headers = container.querySelectorAll('[data-day-header]')
    expect(headers.length).toBeGreaterThan(1)
    expect(headers.length).toBeLessThan(10)
    for (const header of headers) {
      expect(header.parentElement?.className).toContain('group')
      expect(header.parentElement?.firstElementChild).toBe(header)
    }
  })

  it('pads the list out to the length of the rows that are not there', () => {
    const { container } = render(<TransactionList rows={rows} lookup={lookup} />)
    const list = container.querySelector<HTMLElement>('[class*="listWindowed"]')!
    expect(list.style.paddingTop).toBe('0px')
    expect(parseFloat(list.style.paddingBottom)).toBeGreaterThan(100_000)
  })

  it('swaps the rows for those at the new place when the page scrolls', () => {
    const { container } = render(<TransactionList rows={rows} lookup={lookup} />)
    scrollTo(60_000)

    const keys = rendered(container)
    expect(keys.length).toBeGreaterThan(10)
    expect(keys.length).toBeLessThan(80)
    expect(Math.min(...keys)).toBeGreaterThan(700)
    expect(Math.max(...keys)).toBeLessThan(1100)
    expect(screen.queryByText('Txn 1')).toBeNull()
    const list = container.querySelector<HTMLElement>('[class*="listWindowed"]')!
    expect(parseFloat(list.style.paddingTop)).toBeGreaterThan(40_000)

    scrollTo(0)
    expect(screen.getByText('Txn 1')).toBeInTheDocument()
  })

  it('keeps the rows it has through a small scroll rather than redrawing at every step', () => {
    const { container } = render(<TransactionList rows={rows} lookup={lookup} />)
    const before = container.querySelector('[data-vrow]')
    scrollTo(100)
    expect(container.querySelector('[data-vrow]')).toBe(before)
  })

  it('lays the list out again from the real row heights once they are measured', () => {
    const guessed = render(<TransactionList rows={rows} lookup={lookup} />)
    const guessedCount = rendered(guessed.container).length
    guessed.unmount()

    rowHeight = 100
    const { container } = render(<TransactionList rows={rows} lookup={lookup} />)
    expect(rendered(container).length).toBeLessThan(guessedCount)
  })

  it('starts the measuring again when a row is laid out differently', () => {
    rowHeight = 100
    const { container, rerender } = render(<TransactionList rows={rows} lookup={lookup} />)
    const tall = rendered(container).length
    rowHeight = 50
    rerender(<TransactionList rows={rows} lookup={lookup} selectMode />)
    expect(rendered(container).length).toBeGreaterThan(tall)
  })

  it('renders no rows for a folded day, and nothing for the days it pushes out of the window', () => {
    const dates = Array.from({ length: 300 }, (_, i) => day(i))
    localStorage.setItem('exp-txn-collapsed-dates', JSON.stringify(dates))
    const { container } = render(<TransactionList rows={rows} lookup={lookup} />)
    expect(rendered(container)).toEqual([])
    const headers = container.querySelectorAll('[data-day-header]')
    expect(headers.length).toBeGreaterThan(5)
    expect(container.querySelectorAll('[aria-expanded="false"]').length).toBe(headers.length)
  })

  it('shows the rows of a day as soon as it is unfolded', () => {
    localStorage.setItem('exp-txn-collapsed-dates', JSON.stringify([day(0)]))
    const { container } = render(<TransactionList rows={rows} lookup={lookup} />)
    expect(screen.queryByText('Txn 1')).toBeNull()
    fireEvent.click(container.querySelector<HTMLElement>('[aria-expanded="false"]')!)
    expect(screen.getByText('Txn 1')).toBeInTheDocument()
  })

  describe('folding a day', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      setMotionDisabledForTests(false)
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('keeps its rows until the fold has played, then drops them', () => {
      const { container } = render(<TransactionList rows={rows} lookup={lookup} />)
      fireEvent.click(container.querySelector<HTMLElement>('[aria-expanded="true"]')!)

      expect(screen.getByText('Txn 1')).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(200)
      })
      expect(screen.queryByText('Txn 1')).toBeNull()
      expect(screen.getByText('Txn 11')).toBeInTheDocument()
    })

    it('brings them back at once when the day is unfolded again', () => {
      const { container } = render(<TransactionList rows={rows} lookup={lookup} />)
      fireEvent.click(container.querySelector<HTMLElement>('[aria-expanded="true"]')!)
      act(() => {
        vi.advanceTimersByTime(200)
      })
      fireEvent.click(container.querySelector<HTMLElement>('[aria-expanded="false"]')!)
      expect(screen.getByText('Txn 1')).toBeInTheDocument()
    })

    it('does not drop the rows if the day is unfolded before the fold ends', () => {
      const { container } = render(<TransactionList rows={rows} lookup={lookup} />)
      fireEvent.click(container.querySelector<HTMLElement>('[aria-expanded="true"]')!)
      act(() => {
        vi.advanceTimersByTime(100)
      })
      fireEvent.click(container.querySelector<HTMLElement>('[aria-expanded="false"]')!)
      act(() => {
        vi.advanceTimersByTime(200)
      })
      expect(screen.getByText('Txn 1')).toBeInTheDocument()
    })
  })
})

describe('TransactionList windowed, one very long day', () => {
  const rows = ledger(1000, 1000)

  it('renders only part of the day, between padding for the rest', () => {
    const { container } = render(<TransactionList rows={rows} lookup={lookup} />)
    expect(rendered(container).length).toBeLessThan(80)
    scrollTo(30_000)
    expect(screen.queryByText('Txn 1')).toBeNull()
    const inner = container.querySelector<HTMLElement>('[class*="dayRowsInner"]')!
    const before = inner.firstElementChild as HTMLElement
    expect(before.hasAttribute('data-vrow')).toBe(false)
    expect(before).toHaveAttribute('aria-hidden', 'true')
    expect(parseFloat(before.style.height)).toBeGreaterThan(20_000)
    expect(rendered(container).length).toBeGreaterThan(10)
  })

  it('selects the whole day from its header, rows that are not rendered included', () => {
    const onToggleDate = vi.fn()
    const { container } = render(
      <TransactionList rows={rows} lookup={lookup} selectMode selectedIds={new Set()} onToggleDate={onToggleDate} />,
    )
    expect(rendered(container).length).toBeLessThan(80)
    fireEvent.click(container.querySelector<HTMLElement>('[class*="daySelectBtn"]')!)
    expect(onToggleDate).toHaveBeenCalledTimes(1)
    const ids = onToggleDate.mock.calls[0]![0] as number[]
    expect(ids).toHaveLength(1000)
    expect(ids[0]).toBe(1)
    expect(ids[999]).toBe(1000)
  })

  it('counts the day in its header from the data, not from what is rendered', () => {
    render(<TransactionList rows={rows} lookup={lookup} selectMode selectedIds={new Set()} />)
    expect(screen.getByText('1000')).toBeInTheDocument()
  })
})
