import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset } from '../types'
import type { ExpenseDataSource } from '../data/dataSource'
import { useExpenseData } from './useExpenseData'

const emptyDataset: ExpenseDataset = {
  categories: [],
  accounts: [],
  transactions: [],
  accountStatements: [],
  cashActuals: [],
  goalInputs: {
    housePriceCents: 0,
    downPaymentFraction: 0,
    mortgageTermYears: 0,
    mortgageRateAnnual: 0,
    longTermTargetCents: 0,
    horizonYears: 0,
    expectedRealReturn: 0,
  },
  settings: {
    openingCashCents: 0,
    openingInvestmentCents: 0,
    liquidNetWorthCents: 0,
    defaultAccountId: null,
  },
}

describe('useExpenseData', () => {
  it('loads the dataset from the source', async () => {
    const load = vi.fn().mockResolvedValue(emptyDataset)
    const source: ExpenseDataSource = { canWrite: false, load }
    const { result } = renderHook(() => useExpenseData(source))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(load).toHaveBeenCalledOnce()
    expect(result.current.model?.dataset).toEqual(emptyDataset)
  })

  it('applyPatch rebuilds the model without reloading', async () => {
    const load = vi.fn().mockResolvedValue(emptyDataset)
    const source: ExpenseDataSource = { canWrite: false, load }
    const { result } = renderHook(() => useExpenseData(source))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    result.current.applyPatch((d) => ({
      ...d,
      settings: { ...d.settings, openingCashCents: 999 },
    }))
    await waitFor(() =>
      expect(result.current.model?.dataset.settings.openingCashCents).toBe(999),
    )
    expect(load).toHaveBeenCalledOnce()
  })
})
