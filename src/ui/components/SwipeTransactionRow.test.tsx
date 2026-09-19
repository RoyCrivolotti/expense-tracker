import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../../types'
import { buildLookup } from '../format'
import { makeDataset } from '../../testing/factories'
import { SwipeTransactionRow } from './SwipeTransactionRow'

const lookup = buildLookup(
  makeDataset({
    categories: [{ id: 1, name: 'Groceries', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
    accounts: [{ id: 1, name: 'Debit', kind: 'debit', settlement: 'immediate', active: true }],
  }),
)

const txn: Transaction = {
  id: 1,
  date: '2026-07-15',
  budgetMonth: '2026-07',
  description: 'Weekly shop',
  accountId: 1,
  categoryId: 1,
  type: 'expense',
  amountCents: 7_115,
  cancelled: false,
  status: 'posted',
}

function renderRow() {
  render(<SwipeTransactionRow txn={txn} lookup={lookup} showDate={false} onDuplicate={vi.fn()} />)
  return screen.getByRole('button', { name: /Weekly shop/ }).parentElement as HTMLElement
}

const touch = (clientX: number) => ({ touches: [{ clientX }] })

describe('SwipeTransactionRow transform', () => {
  it('has no transform at rest, so a long list is not one compositor layer per row', () => {
    expect(renderRow().style.transform).toBe('')
  })

  it('follows the finger while dragging', () => {
    const slide = renderRow()
    fireEvent.touchStart(slide, touch(200))
    expect(slide.style.transform).toBe('translate3d(0px, 0, 0)')
    fireEvent.touchMove(slide, touch(150))
    expect(slide.style.transform).toBe('translate3d(-50px, 0, 0)')
  })

  it('drops the transform again once the row is closed', () => {
    const slide = renderRow()
    fireEvent.touchStart(slide, touch(200))
    fireEvent.touchMove(slide, touch(100))
    fireEvent.touchEnd(slide)
    expect(slide.style.transform).not.toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(slide.style.transform).toBe('')
  })
})
