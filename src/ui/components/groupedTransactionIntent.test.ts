import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT } from '../../engine/money'
import type { Category } from '../../types'
import {
  allLines,
  applyGroupDefaults,
  buildGroupedTransactions,
  groupTotals,
  isLineEmpty,
  lineError,
  nextGroupSeed,
  type EntryGroupDraft,
  type GroupLineDraft,
} from './groupedTransactionIntent'

function line(overrides: Partial<GroupLineDraft> = {}): GroupLineDraft {
  return {
    id: 'l1',
    type: 'expense',
    amount: '',
    description: '',
    categoryId: 1,
    accountId: 1,
    ...overrides,
  }
}

function group(overrides: Partial<EntryGroupDraft> = {}): EntryGroupDraft {
  return {
    id: 'g1',
    date: '2026-03-10',
    categoryId: 1,
    accountId: 1,
    type: 'expense',
    lines: [],
    draft: line({ id: 'd1' }),
    ...overrides,
  }
}

/** Distinct ids and an inactive entry, so "first active not already claimed" is actually proven. */
function categories(): Category[] {
  return [
    { id: 1, name: 'Groceries', monthlyBudgetCents: 0, sortOrder: 0, active: true },
    { id: 2, name: 'Dining out', monthlyBudgetCents: 0, sortOrder: 1, active: true },
    { id: 3, name: 'Retired', monthlyBudgetCents: 0, sortOrder: 2, active: false },
  ]
}

describe('isLineEmpty / lineError', () => {
  it('treats a line with neither description nor amount as empty', () => {
    expect(isLineEmpty(line())).toBe(true)
    expect(isLineEmpty(line({ description: 'Coffee' }))).toBe(false)
    expect(isLineEmpty(line({ amount: '3,50' }))).toBe(false)
  })

  it('reports no error for an empty line, but flags a non-empty one with no positive amount', () => {
    expect(lineError(line(), EU_MONEY_FORMAT)).toBeNull()
    expect(lineError(line({ description: 'Coffee' }), EU_MONEY_FORMAT)).toBe(
      'Enter an amount greater than zero',
    )
    expect(lineError(line({ description: 'Coffee', amount: '0' }), EU_MONEY_FORMAT)).toBe(
      'Enter an amount greater than zero',
    )
    expect(lineError(line({ description: 'Coffee', amount: '3,50' }), EU_MONEY_FORMAT)).toBeNull()
  })
})

describe('allLines', () => {
  it('includes the uncommitted strip after the committed lines', () => {
    const g = group({ lines: [line({ id: 'a' })], draft: line({ id: 'strip' }) })
    expect(allLines(g).map((l) => l.id)).toEqual(['a', 'strip'])
  })
})

describe('buildGroupedTransactions', () => {
  it('returns nothing-entered when every line is empty', () => {
    expect(buildGroupedTransactions([group()], EU_MONEY_FORMAT, 1)).toEqual({ ok: false, errors: {} })
  })

  it('derives budgetMonth per group from its own date and the rollover day', () => {
    // Spending on or after the rollover day counts towards next month's budget,
    // so day 10 with a rollover of 5 lands in April — proving the derivation
    // actually runs rather than falling back to the calendar month.
    const result = buildGroupedTransactions(
      [group({ date: '2026-03-10', lines: [line({ id: 'a', description: 'Coffee', amount: '3,50' })] })],
      EU_MONEY_FORMAT,
      5,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.transactions[0]).toMatchObject({ date: '2026-03-10', budgetMonth: '2026-04' })
  })

  it('keeps the calendar month for a date before the rollover day', () => {
    const result = buildGroupedTransactions(
      [group({ date: '2026-03-03', lines: [line({ id: 'a', description: 'Coffee', amount: '3,50' })] })],
      EU_MONEY_FORMAT,
      5,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.transactions[0]).toMatchObject({ budgetMonth: '2026-03' })
  })

  it('flattens groups in order, carrying each group its own date and the line its own fields', () => {
    const result = buildGroupedTransactions(
      [
        group({
          id: 'g1',
          date: '2026-03-10',
          lines: [line({ id: 'a', description: '  Mercadona  ', amount: '12,50', categoryId: 2, accountId: 4 })],
        }),
        group({
          id: 'g2',
          date: '2026-03-11',
          lines: [line({ id: 'b', description: 'Taxi', amount: '9,80', type: 'expense', categoryId: 7 })],
          draft: line({ id: 'd2' }),
        }),
      ],
      EU_MONEY_FORMAT,
      1,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0]).toEqual({
      date: '2026-03-10',
      budgetMonth: '2026-03',
      description: 'Mercadona',
      accountId: 4,
      categoryId: 2,
      type: 'expense',
      amountCents: 1250,
      cancelled: false,
    })
    expect(result.transactions[1]).toMatchObject({ date: '2026-03-11', categoryId: 7, amountCents: 980 })
  })

  it('saves a valid uncommitted strip rather than dropping it', () => {
    const result = buildGroupedTransactions(
      [group({ draft: line({ id: 'strip', description: 'Coffee', amount: '3,50' }) })],
      EU_MONEY_FORMAT,
      1,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.transactions).toEqual([expect.objectContaining({ description: 'Coffee', amountCents: 350 })])
  })

  it('normalizes a negative amount to positive cents', () => {
    const result = buildGroupedTransactions(
      [group({ lines: [line({ id: 'a', description: 'Refund', amount: '-4,00' })] })],
      EU_MONEY_FORMAT,
      1,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.transactions[0]).toMatchObject({ amountCents: 400 })
  })

  it('flags a line with a description but no positive amount, and saves nothing', () => {
    const result = buildGroupedTransactions(
      [group({ lines: [line({ id: 'bad', description: 'Broken', amount: '0' })] })],
      EU_MONEY_FORMAT,
      1,
    )
    expect(result).toEqual({ ok: false, errors: { bad: 'Enter an amount greater than zero' } })
  })
})

describe('groupTotals', () => {
  it('counts and sums only lines that will actually be written, strip included', () => {
    const totals = groupTotals(
      [
        group({
          lines: [
            line({ id: 'a', description: 'Mercadona', amount: '12,50' }),
            line({ id: 'b', description: 'No amount yet' }),
            line({ id: 'c' }),
          ],
          draft: line({ id: 'strip', description: 'Coffee', amount: '3,50' }),
        }),
      ],
      EU_MONEY_FORMAT,
    )
    expect(totals).toEqual({ count: 2, totalCents: 1600 })
  })
})

describe('applyGroupDefaults', () => {
  it('carries a category change into lines that were still following the old default', () => {
    const g = group({
      categoryId: 1,
      lines: [line({ id: 'a', categoryId: 1 }), line({ id: 'b', categoryId: 1 })],
      draft: line({ id: 'strip', categoryId: 1 }),
    })
    const next = applyGroupDefaults(g, { categoryId: 2 })
    expect(next.categoryId).toBe(2)
    expect(next.lines.map((l) => l.categoryId)).toEqual([2, 2])
    expect(next.draft.categoryId).toBe(2)
  })

  it('leaves an individually overridden line alone', () => {
    const g = group({
      categoryId: 1,
      lines: [line({ id: 'a', categoryId: 1 }), line({ id: 'overridden', categoryId: 9 })],
    })
    const next = applyGroupDefaults(g, { categoryId: 2 })
    expect(next.lines.map((l) => l.categoryId)).toEqual([2, 9])
  })

  it('applies the same rule to account and type', () => {
    const g = group({
      accountId: 1,
      type: 'expense',
      lines: [line({ id: 'a', accountId: 1, type: 'expense' }), line({ id: 'b', accountId: 5, type: 'income' })],
    })
    const next = applyGroupDefaults(g, { accountId: 3, type: 'refund' })
    expect(next.lines[0]).toMatchObject({ accountId: 3, type: 'refund' })
    expect(next.lines[1]).toMatchObject({ accountId: 5, type: 'income' })
  })

  it('changes the date without touching any line field', () => {
    const g = group({ date: '2026-03-10', lines: [line({ id: 'a', categoryId: 1, accountId: 1 })] })
    const next = applyGroupDefaults(g, { date: '2026-03-09' })
    expect(next.date).toBe('2026-03-09')
    expect(next.lines[0]).toMatchObject({ categoryId: 1, accountId: 1 })
  })
})

describe('nextGroupSeed', () => {
  it('returns null when there is no group to seed from', () => {
    expect(nextGroupSeed([], categories())).toBeNull()
  })

  it('keeps the date, account and type, and picks the first active unclaimed category', () => {
    const seed = nextGroupSeed([group({ date: '2026-03-10', categoryId: 1, accountId: 4, type: 'income' })], categories())
    expect(seed).toEqual({ date: '2026-03-10', categoryId: 2, accountId: 4, type: 'income' })
  })

  it('ignores inactive categories and falls back once every active one is claimed on that date', () => {
    const seed = nextGroupSeed(
      [group({ id: 'g1', categoryId: 1 }), group({ id: 'g2', categoryId: 2 })],
      categories(),
    )
    // Category 3 is inactive, so there is nothing free — fall back to the last group's category.
    expect(seed).toMatchObject({ categoryId: 2 })
  })

  it('only treats categories on the same date as claimed', () => {
    const seed = nextGroupSeed(
      [group({ id: 'g1', date: '2026-03-09', categoryId: 2 }), group({ id: 'g2', date: '2026-03-10', categoryId: 1 })],
      categories(),
    )
    // The 9th's use of category 2 must not block the 10th from taking it.
    expect(seed).toEqual({ date: '2026-03-10', categoryId: 2, accountId: 1, type: 'expense' })
  })
})
