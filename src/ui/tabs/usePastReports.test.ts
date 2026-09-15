import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeTransaction } from '../../testing/factories'
import { usePastReports } from './usePastReports'

const payment = () =>
  makeTransaction({ id: 99, type: 'refund', amountCents: 14_000, description: 'Alicante' })

describe('usePastReports entry', () => {
  it('is hidden until something has been reimbursed', () => {
    const { result } = renderHook(() => usePastReports([makeTransaction({ id: 1 })]))

    expect(result.current.entry).toBeUndefined()
  })

  it('opens once a row points at a payment', () => {
    const { result } = renderHook(() =>
      usePastReports([makeTransaction({ id: 1, settledBy: 99 }), payment()]),
    )

    expect(result.current.entry).toBeDefined()
    act(() => result.current.entry!())
    expect(result.current.listing).toBe(true)
  })

  it('stays reachable when every covered row has since gone', () => {
    // The report the snapshot preserved is exactly the one worth being able to open.
    const stamped = { ...payment(), reportCount: 2, reportCoveredCents: 20_000 }
    const { result } = renderHook(() => usePastReports([stamped]))

    expect(result.current.entry).toBeDefined()
  })

  it('stays hidden for a refund that never settled anything', () => {
    const { result } = renderHook(() => usePastReports([payment()]))

    expect(result.current.entry).toBeUndefined()
  })
})
