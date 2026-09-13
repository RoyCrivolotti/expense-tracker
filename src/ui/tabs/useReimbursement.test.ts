import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { makeActions } from '../../testing/makeActions'
import { makeFlag, makeTransaction } from '../../testing/factories'
import { netSpendCents } from '../../domain/engine/transactions'
import type { FlagGroup } from '../../domain/engine/flagGroups'
import { useReimbursement } from './useReimbursement'

const rows = [makeTransaction({ id: 1, flagId: 4, amountCents: 10_000 })]
const group: FlagGroup = {
  flag: makeFlag({ id: 4, name: 'Work travel' }),
  transactions: rows,
  count: rows.length,
  totalCents: netSpendCents(rows),
}

const payment = {
  date: '2026-06-14',
  budgetMonth: '2026-06',
  description: 'Reimbursement — Work travel',
  accountId: 1,
  categoryId: 2,
  amountCents: 10_000,
}

describe('useReimbursement', () => {
  it('closes the sheet once the payment is recorded', async () => {
    const actions = makeActions()
    const { result } = renderHook(() => useReimbursement(actions))

    act(() => result.current.open(group))
    expect(result.current.group).toBe(group)

    act(() => result.current.record(payment, [1]))

    await waitFor(() => expect(result.current.group).toBeNull())
    expect(result.current.busy).toBe(false)
  })

  it('records it as a refund, which is what nets it against the spending', () => {
    const actions = makeActions()
    const { result } = renderHook(() => useReimbursement(actions))

    act(() => result.current.record(payment, [1]))

    expect(actions.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'refund', cancelled: false }),
    )
  })

  it('keeps the sheet open and says nothing was recorded when it fails', async () => {
    // The payment is rolled back, so the user has to be told it did not happen
    // — the sheet used to just sit there.
    const actions = makeActions({
      createTransaction: vi.fn().mockResolvedValue(makeTransaction({ id: 99 })),
      updateTransactions: vi.fn().mockRejectedValue(new Error('Receipt storage is full')),
    })
    const { result } = renderHook(() => useReimbursement(actions))

    act(() => result.current.open(group))
    act(() => result.current.record(payment, [1]))

    await waitFor(() => expect(result.current.error).toContain('Nothing was recorded'))
    expect(result.current.error).toContain('Receipt storage is full')
    expect(result.current.group).toBe(group)
    expect(result.current.busy).toBe(false)
  })

  it('clears a stale error when the sheet is closed', async () => {
    const actions = makeActions({
      updateTransactions: vi.fn().mockRejectedValue(new Error('network down')),
    })
    const { result } = renderHook(() => useReimbursement(actions))

    act(() => result.current.open(group))
    act(() => result.current.record(payment, [1]))
    await waitFor(() => expect(result.current.error).not.toBeNull())

    act(() => result.current.cancel())

    expect(result.current.error).toBeNull()
    expect(result.current.group).toBeNull()
  })

  it('does nothing at all in a read-only session', () => {
    const { result } = renderHook(() => useReimbursement(undefined))

    act(() => result.current.record(payment, [1]))

    expect(result.current.busy).toBe(false)
  })
})
