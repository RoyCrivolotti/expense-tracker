import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT } from '../../engine/money'
import { buildBatchTransactions, type DateBatchDraft } from './batchTransactionIntent'

function row(overrides: Partial<DateBatchDraft['rows'][number]> = {}) {
  return { id: 'r1', type: 'expense' as const, amount: '', description: '', categoryId: 1, ...overrides }
}

function batch(overrides: Partial<DateBatchDraft> = {}): DateBatchDraft {
  return { id: 'b1', date: '2026-03-10', accountId: 1, rows: [row()], ...overrides }
}

describe('buildBatchTransactions', () => {
  it('skips rows with no description and no amount', () => {
    const result = buildBatchTransactions(
      [batch({ rows: [row({ id: 'r1' }), row({ id: 'r2' })] })],
      EU_MONEY_FORMAT,
      1,
    )
    expect(result).toEqual({ ok: false, errors: {} })
  })

  it('builds a NewTransaction per non-empty row, deriving budgetMonth from the batch date', () => {
    const result = buildBatchTransactions(
      [
        batch({
          date: '2026-03-10',
          accountId: 4,
          rows: [row({ id: 'r1', description: 'Mercadona', amount: '12,50', categoryId: 2 })],
        }),
      ],
      EU_MONEY_FORMAT,
      1,
    )
    expect(result).toEqual({
      ok: true,
      transactions: [
        {
          date: '2026-03-10',
          budgetMonth: '2026-03',
          description: 'Mercadona',
          accountId: 4,
          categoryId: 2,
          type: 'expense',
          amountCents: 1250,
          cancelled: false,
        },
      ],
    })
  })

  it('trims whitespace from the description', () => {
    const result = buildBatchTransactions(
      [batch({ rows: [row({ description: '  Mercadona  ', amount: '5' })] })],
      EU_MONEY_FORMAT,
      1,
    )
    expect(result.ok).toBe(true)
    expect(result.ok && result.transactions[0]!.description).toBe('Mercadona')
  })

  it('flags a row with a zero amount, keyed by row id', () => {
    const result = buildBatchTransactions(
      [batch({ rows: [row({ id: 'bad-row', description: 'Something', amount: '0' })] })],
      EU_MONEY_FORMAT,
      1,
    )
    expect(result).toEqual({ ok: false, errors: { 'bad-row': 'Enter an amount greater than zero' } })
  })

  it('does not let a valid row in one batch mask an invalid row in another', () => {
    const result = buildBatchTransactions(
      [
        batch({ id: 'b1', rows: [row({ id: 'ok', description: 'Coffee', amount: '3' })] }),
        batch({ id: 'b2', rows: [row({ id: 'bad', description: 'Broken', amount: '0' })] }),
      ],
      EU_MONEY_FORMAT,
      1,
    )
    expect(result).toEqual({ ok: false, errors: { bad: 'Enter an amount greater than zero' } })
  })

  it('flattens multiple batches into one array, preserving per-batch date/account and per-row fields', () => {
    const result = buildBatchTransactions(
      [
        batch({
          id: 'b1',
          date: '2026-03-01',
          accountId: 1,
          rows: [row({ id: 'r1', description: 'Groceries', amount: '20', categoryId: 5, type: 'expense' })],
        }),
        batch({
          id: 'b2',
          date: '2026-03-02',
          accountId: 2,
          rows: [row({ id: 'r2', description: 'Refund', amount: '10', categoryId: 6, type: 'refund' })],
        }),
      ],
      EU_MONEY_FORMAT,
      1,
    )
    expect(result.ok).toBe(true)
    expect(result.ok && result.transactions).toEqual([
      {
        date: '2026-03-01',
        budgetMonth: '2026-03',
        description: 'Groceries',
        accountId: 1,
        categoryId: 5,
        type: 'expense',
        amountCents: 2000,
        cancelled: false,
      },
      {
        date: '2026-03-02',
        budgetMonth: '2026-03',
        description: 'Refund',
        accountId: 2,
        categoryId: 6,
        type: 'refund',
        amountCents: 1000,
        cancelled: false,
      },
    ])
  })

  it('derives budgetMonth using the configured rollover day', () => {
    const result = buildBatchTransactions(
      [batch({ date: '2026-03-28', rows: [row({ description: 'Late-month buy', amount: '9' })] })],
      EU_MONEY_FORMAT,
      25,
    )
    expect(result.ok).toBe(true)
    expect(result.ok && result.transactions[0]!.budgetMonth).toBe('2026-04')
  })
})
