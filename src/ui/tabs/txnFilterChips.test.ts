import { describe, expect, it, vi } from 'vitest'
import { buildActiveFilterChips } from './txnFilterChips'

function input(overrides: Partial<Parameters<typeof buildActiveFilterChips>[0]> = {}) {
  return {
    categories: [{ id: 1, name: 'Travel', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
    accounts: [{ id: 2, name: 'Debit', kind: 'debit' as const, settlement: 'immediate' as const, active: true }],
    flags: [{ id: 3, name: 'Work travel', color: '#6366f1', reimbursable: true, sortOrder: 0, active: true }],
    labels: [
      { id: 10, name: 'Madrid trip', color: '#f59e0b', sortOrder: 0, active: true },
      { id: 11, name: 'Moving', color: '#10b981', sortOrder: 1, active: true },
    ],
    categoryId: 'all' as const,
    accountId: 'all' as const,
    flagId: 'all' as const,
    labelIds: [] as number[],
    txnType: 'all' as const,
    status: 'all' as const,
    dateScope: 'budgetMonth' as const,
    customDateFrom: '',
    customDateTo: '',
    onCategory: vi.fn(),
    onAccount: vi.fn(),
    onFlag: vi.fn(),
    onLabelIds: vi.fn(),
    onTxnType: vi.fn(),
    onStatus: vi.fn(),
    onDateScope: vi.fn(),
    onCustomDateFrom: vi.fn(),
    onCustomDateTo: vi.fn(),
    ...overrides,
  }
}

describe('buildActiveFilterChips', () => {
  it('returns nothing when no filter is set', () => {
    expect(buildActiveFilterChips(input())).toEqual([])
  })

  it('names the flag being filtered to', () => {
    const chips = buildActiveFilterChips(input({ flagId: 3 }))

    expect(chips.map((c) => c.label)).toEqual(['Flag: Work travel'])
  })

  it('labels the unflagged filter without a "Flag:" prefix', () => {
    expect(buildActiveFilterChips(input({ flagId: 'none' }))[0]?.label).toBe('Unflagged')
  })

  it('falls back to a generic label when the flag is gone', () => {
    // The flag can be deleted in another tab while its filter is still applied.
    expect(buildActiveFilterChips(input({ flagId: 99 }))[0]?.label).toBe('Flag: Flag')
  })

  it('clearing the flag chip resets the filter to all', () => {
    const onFlag = vi.fn()
    buildActiveFilterChips(input({ flagId: 3, onFlag }))[0]?.onClear()

    expect(onFlag).toHaveBeenCalledWith('all')
  })

  it('orders the flag chip between account and type', () => {
    const chips = buildActiveFilterChips(
      input({ categoryId: 1, accountId: 2, flagId: 3, txnType: 'expense', status: 'posted' }),
    )

    expect(chips.map((c) => c.key)).toEqual(['category', 'account', 'flag', 'type', 'status'])
  })

  it('names a single selected label', () => {
    expect(buildActiveFilterChips(input({ labelIds: [10] }))[0]?.label).toBe('Label: Madrid trip')
  })

  it('joins two selected labels by name', () => {
    expect(buildActiveFilterChips(input({ labelIds: [10, 11] }))[0]?.label).toBe(
      'Labels: Madrid trip, Moving',
    )
  })

  it('shows a count instead of names once more than two labels are selected', () => {
    expect(buildActiveFilterChips(input({ labelIds: [10, 11, 12] }))[0]?.label).toBe('Labels (3)')
  })

  it('falls back to a generic name when a selected label is gone', () => {
    expect(buildActiveFilterChips(input({ labelIds: [99] }))[0]?.label).toBe('Label: Label')
  })

  it('clearing the labels chip resets the whole selection', () => {
    const onLabelIds = vi.fn()
    buildActiveFilterChips(input({ labelIds: [10, 11], onLabelIds }))[0]?.onClear()

    expect(onLabelIds).toHaveBeenCalledWith([])
  })

  it('orders the labels chip between flag and type', () => {
    const chips = buildActiveFilterChips(
      input({ categoryId: 1, accountId: 2, flagId: 3, labelIds: [10], txnType: 'expense', status: 'posted' }),
    )

    expect(chips.map((c) => c.key)).toEqual(['category', 'account', 'flag', 'labels', 'type', 'status'])
  })

  it('still builds the other chips', () => {
    const chips = buildActiveFilterChips(input({ categoryId: 1, accountId: 2 }))

    expect(chips.map((c) => c.label)).toEqual(['Category: Travel', 'Account: Debit'])
  })

  it('labels type and status, and clears them', () => {
    const onTxnType = vi.fn()
    const onStatus = vi.fn()
    const chips = buildActiveFilterChips(
      input({ txnType: 'refund', status: 'forecast', onTxnType, onStatus }),
    )

    expect(chips.map((c) => c.label)).toEqual(['Type: refund', 'Status: forecast'])
    chips[0]?.onClear()
    chips[1]?.onClear()
    expect(onTxnType).toHaveBeenCalledWith('all')
    expect(onStatus).toHaveBeenCalledWith('all')
  })

  it('clearing the date chip also drops any custom range', () => {
    const onDateScope = vi.fn()
    const onCustomDateFrom = vi.fn()
    const onCustomDateTo = vi.fn()
    const chips = buildActiveFilterChips(
      input({ dateScope: 'allDates', onDateScope, onCustomDateFrom, onCustomDateTo }),
    )

    expect(chips).toHaveLength(1)
    chips[0]?.onClear()

    expect(onDateScope).toHaveBeenCalledWith('budgetMonth')
    expect(onCustomDateFrom).toHaveBeenCalledWith('')
    expect(onCustomDateTo).toHaveBeenCalledWith('')
  })

  it('falls back to generic names when a category or account is gone', () => {
    const chips = buildActiveFilterChips(input({ categoryId: 99, accountId: 99 }))

    expect(chips.map((c) => c.label)).toEqual(['Category: Category', 'Account: Account'])
  })
})
