import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PAGE_LIMIT,
  MAX_CASE_FOLDS,
  MAX_FILTER_LABELS,
  MAX_PAGE_LIMIT,
  MAX_QUERY_LENGTH,
} from '../data/transactionQuery'
import { inMemoryExpenseRepository } from '../../testing/inMemoryExpenseRepository'
import { makeTransaction } from '../../testing/factories'
import type { Transaction } from '../types'
import { decodeCursor, encodeCursor, filterHash } from './transactionCursor'
import { listTransactions, summarizeTransactions, validateTxnFilter } from './transactionQueryService'
import { ValidationError } from './validationError'

const OWNER = 'owner@example.com'

function ledger(count: number): Transaction[] {
  return Array.from({ length: count }, (_, i) =>
    makeTransaction({
      id: i + 1,
      date: `2026-05-${String(1 + (i % 7)).padStart(2, '0')}`,
      budgetMonth: '2026-05',
      description: i % 2 === 0 ? 'Coffee' : 'Market',
      amountCents: 100 * (i + 1),
    }),
  )
}

function repoWith(transactions: Transaction[]) {
  return inMemoryExpenseRepository(
    {
      accounts: [{ id: 1, name: 'Main', kind: 'debit', settlement: 'immediate', active: true }],
      transactions,
    },
    OWNER,
  )
}

describe('validateTxnFilter', () => {
  it('accepts nothing at all, and every field of the filter', () => {
    expect(validateTxnFilter(undefined)).toEqual({})
    expect(validateTxnFilter({})).toEqual({})
    const full = {
      dateFrom: '2026-01-01',
      dateTo: '2026-02-28',
      categoryId: 3,
      accountId: 2,
      type: 'expense',
      status: 'posted',
      flagId: 4,
      labelIds: [2, 1],
      query: 'Cafe',
      amountMinCents: 0,
      amountMaxCents: 5_000,
      queryAmount: { fromCents: 6_400, toCents: 6_499 },
    }
    expect(validateTxnFilter(full)).toEqual({ ...full, labelIds: [1, 2] })
    expect(validateTxnFilter({ month: '2026-03', flagId: 'none' })).toEqual({ month: '2026-03', flagId: 'none' })
  })

  it('spells filters that select the same rows the same way', () => {
    const plain = validateTxnFilter({ categoryId: 2 })
    expect(validateTxnFilter({ categoryId: 2, type: 'all', status: 'all', labelIds: [], query: '' })).toEqual(plain)
    expect(validateTxnFilter({ month: '2026-01', dateFrom: '2026-01-05' })).toEqual({ dateFrom: '2026-01-05' })
    expect(validateTxnFilter({ queryAmount: { fromCents: 1, toCents: 2 } })).toEqual({})
    expect(validateTxnFilter({ labelIds: [3, 1, 3, 2] })).toEqual({ labelIds: [1, 2, 3] })
    expect(validateTxnFilter({ categoryId: undefined })).toEqual({})
  })

  const refused: Array<[string, unknown, string]> = [
    ['a filter that is not an object', 'month=2026-01', 'filter must be an object'],
    ['a list as the filter', [], 'filter must be an object'],
    ['an unknown field', { owner: 'someone@example.com' }, 'Unknown filter: owner'],
    ['a month that does not exist', { month: '2026-13' }, 'month must be YYYY-MM'],
    ['a month without its zero', { month: '2026-1' }, 'month must be YYYY-MM'],
    ['a date that is not on the calendar', { dateFrom: '2026-02-30' }, 'dateFrom must be a calendar date'],
    ['a blank date', { dateTo: '' }, 'dateTo must be a calendar date'],
    ['a category of zero', { categoryId: 0 }, 'categoryId must be a positive whole number'],
    ['a fractional account', { accountId: 1.5 }, 'accountId must be a positive whole number'],
    ['an id given as text', { categoryId: '3' }, 'categoryId must be a positive whole number'],
    ['a type that does not exist', { type: 'gift' }, 'type must be one of'],
    ['a status that does not exist', { status: 'pending' }, 'status must be one of'],
    ['a flag that is neither an id nor none', { flagId: 'all' }, 'flagId must be a positive whole number'],
    ['labels that are not a list', { labelIds: 3 }, 'labelIds must be a list'],
    ['a label of zero', { labelIds: [1, 0] }, 'labelIds must be a positive whole number'],
    ['too many labels', { labelIds: Array.from({ length: MAX_FILTER_LABELS + 1 }, (_, i) => i + 1) }, 'at most'],
    ['search text that is not text', { query: 5 }, 'query must be text'],
    ['search text that is too long', { query: 'a'.repeat(MAX_QUERY_LENGTH + 1) }, 'characters or fewer'],
    ['a negative minimum', { amountMinCents: -1 }, 'amountMinCents must be a whole number of cents'],
    ['a fractional maximum', { amountMaxCents: 10.5 }, 'amountMaxCents must be a whole number of cents'],
    ['an amount range that is not an object', { query: 'x', queryAmount: 5 }, 'queryAmount must hold'],
    ['an amount range with a missing end', { query: 'x', queryAmount: { fromCents: 1 } }, 'toCents'],
  ]
  it.each(refused)('refuses %s', (_label, input, message) => {
    expect(() => validateTxnFilter(input)).toThrow(ValidationError)
    expect(() => validateTxnFilter(input)).toThrow(message)
  })

  it('allows as many different accented letters as the SQL can fold, and no more', () => {
    const letters = 'éèêëàâäôöûüçñ'
    expect(() => validateTxnFilter({ query: letters.slice(0, MAX_CASE_FOLDS) })).not.toThrow()
    expect(() => validateTxnFilter({ query: letters.slice(0, MAX_CASE_FOLDS + 1) })).toThrow('accented letters')
    expect(() => validateTxnFilter({ query: 'éÉéÉ'.repeat(30) })).not.toThrow()
  })
})

describe('cursors', () => {
  const filter = validateTxnFilter({ month: '2026-05', type: 'expense' })

  it('round-trip a position and carry nothing else', async () => {
    const cursor = await encodeCursor({ date: '2026-05-04', id: 17 }, filter)
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(await decodeCursor(cursor, filter)).toEqual({ date: '2026-05-04', id: 17 })
    const body = JSON.parse(atob(cursor.replaceAll('-', '+').replaceAll('_', '/'))) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['date', 'filterHash', 'id'])
    expect(JSON.stringify(body)).not.toMatch(/@|owner/)
  })

  it('are tied to the filter, however its fields are ordered', async () => {
    expect(await filterHash({ month: '2026-05', type: 'expense' })).toBe(
      await filterHash({ type: 'expense', month: '2026-05' }),
    )
    const cursor = await encodeCursor({ date: '2026-05-04', id: 17 }, filter)
    await expect(decodeCursor(cursor, validateTxnFilter({ month: '2026-06', type: 'expense' }))).rejects.toThrow(
      'different filter',
    )
    await expect(decodeCursor(cursor, validateTxnFilter({ month: '2026-05' }))).rejects.toThrow(ValidationError)
  })

  const encode = (value: unknown) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

  it('refuse anything that is not a cursor this code wrote', async () => {
    const good = await encodeCursor({ date: '2026-05-04', id: 17 }, filter)
    const hash = await filterHash(filter)
    const bad: unknown[] = [
      undefined,
      5,
      '',
      'not a cursor',
      'a'.repeat(300),
      'AAAA',
      btoa('{"date":'),
      encode(null),
      encode([]),
      encode('text'),
      encode({ date: '2026-05-04', id: 17 }),
      encode({ date: '2026-05-04', id: 17, filterHash: hash, owner: OWNER }),
      encode({ date: '2026-5-4', id: 17, filterHash: hash }),
      encode({ date: 20260504, id: 17, filterHash: hash }),
      encode({ date: '2026-05-04', id: 0, filterHash: hash }),
      encode({ date: '2026-05-04', id: 1.5, filterHash: hash }),
      encode({ date: '2026-05-04', id: '17', filterHash: hash }),
      encode({ date: '2026-05-04', id: 17, filterHash: 5 }),
      `${good}=`,
      ` ${good}`,
      good.slice(0, -2),
      `${good.slice(0, 10)}${good[10] === 'A' ? 'B' : 'A'}${good.slice(11)}`,
    ]
    for (const cursor of bad) {
      await expect(decodeCursor(cursor, filter), String(cursor)).rejects.toThrow(ValidationError)
    }
  })
})

describe('listTransactions', () => {
  it('pages through everything newest first and ends with a null cursor', async () => {
    const repo = repoWith(ledger(23))
    const seen: number[] = []
    let cursor: string | undefined
    let pages = 0
    for (; pages < 10; pages += 1) {
      const page = await listTransactions(repo, OWNER, { filter: {}, limit: 10, ...(cursor ? { cursor } : {}) })
      seen.push(...page.items.map((t) => t.id))
      if (page.nextCursor === null) break
      cursor = page.nextCursor
    }
    expect(pages).toBe(2)
    expect(seen).toHaveLength(23)
    expect(new Set(seen).size).toBe(23)
  })

  it('has no next cursor when the last page is exactly full, and a default page size', async () => {
    const repo = repoWith(ledger(20))
    expect((await listTransactions(repo, OWNER, { filter: {}, limit: 20 })).nextCursor).toBeNull()
    expect((await listTransactions(repo, OWNER, { filter: {}, limit: 19 })).nextCursor).not.toBeNull()
    const big = repoWith(ledger(DEFAULT_PAGE_LIMIT + 5))
    expect((await listTransactions(big, OWNER, { filter: {} })).items).toHaveLength(DEFAULT_PAGE_LIMIT)
  })

  it('refuses a cursor from another filter, and limits outside 1 to the maximum', async () => {
    const repo = repoWith(ledger(30))
    const first = await listTransactions(repo, OWNER, { filter: { query: 'coffee' }, limit: 3 })
    expect(first.nextCursor).not.toBeNull()
    await expect(
      listTransactions(repo, OWNER, { filter: { query: 'market' }, limit: 3, cursor: first.nextCursor }),
    ).rejects.toThrow('different filter')
    for (const limit of [0, -1, MAX_PAGE_LIMIT + 1, 1.5, '10', null, Number.NaN]) {
      await expect(listTransactions(repo, OWNER, { filter: {}, limit }), String(limit)).rejects.toThrow(
        `limit must be a whole number from 1 to ${MAX_PAGE_LIMIT}`,
      )
    }
    expect((await listTransactions(repo, OWNER, { filter: {}, limit: MAX_PAGE_LIMIT })).items).toHaveLength(30)
  })

  it('accepts a cursor made for the same selection spelled differently', async () => {
    const repo = repoWith(ledger(30))
    const first = await listTransactions(repo, OWNER, { filter: { type: 'expense' }, limit: 5 })
    const next = await listTransactions(repo, OWNER, {
      filter: { type: 'expense', status: 'all', labelIds: [] },
      limit: 5,
      cursor: first.nextCursor,
    })
    expect(next.items[0]?.id).toBeLessThan(first.items.at(-1)?.id ?? 0)
  })
})

describe('summarizeTransactions', () => {
  it('validates the filter, then counts and sums', async () => {
    const repo = repoWith(ledger(10))
    expect(await summarizeTransactions(repo, OWNER, { query: 'coffee' })).toEqual({
      count: 5,
      capped: false,
      netSpendCents: 100 + 300 + 500 + 700 + 900,
    })
    await expect(summarizeTransactions(repo, OWNER, { month: 'May' })).rejects.toThrow(ValidationError)
  })
})
