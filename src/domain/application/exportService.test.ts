import { describe, expect, it } from 'vitest'
import { EXPORT_CHUNK_ROWS, EXPORT_TABLES } from '../data/exportTables'
import { inMemoryExpenseRepository } from '../../testing/inMemoryExpenseRepository'
import { parseExportRequest, readExport } from './exportService'

const refused = (run: () => unknown): string => {
  try {
    run()
  } catch (error) {
    return (error as Error).message
  }
  return 'accepted'
}

describe('parseExportRequest', () => {
  it('takes a table alone, and then reads it a full chunk at a time', () => {
    expect(parseExportRequest({ table: 'transactions' })).toEqual({ table: 'transactions', limit: EXPORT_CHUNK_ROWS.transactions })
    expect(parseExportRequest({ table: 'categories' })).toEqual({ table: 'categories', limit: EXPORT_CHUNK_ROWS.categories })
  })

  it('takes a position and a limit up to the table’s bound', () => {
    expect(parseExportRequest({ table: 'transactions', after: '812', limit: '250' })).toEqual({
      table: 'transactions',
      after: '812',
      limit: 250,
    })
    expect(parseExportRequest({ table: 'transactions', limit: String(EXPORT_CHUNK_ROWS.transactions) }).limit).toBe(5_000)
    expect(parseExportRequest({ table: 'cashActuals', after: '2026-03' }).after).toBe('2026-03')
    expect(parseExportRequest({ table: 'accountStatements', after: '4:2026-03' }).after).toBe('4:2026-03')
  })

  it.each([
    ['no table', {}],
    ['a table it does not know', { table: 'users' }],
    ['a table spelt in the database’s way', { table: 'transaction_labels' }],
    ['a position that is not a number', { table: 'transactions', after: 'abc' }],
    ['a position of zero', { table: 'transactions', after: '0' }],
    ['a negative position', { table: 'transactions', after: '-4' }],
    ['a position with SQL in it', { table: 'transactions', after: '1; DROP TABLE transactions' }],
    ['a month where an id belongs', { table: 'labels', after: '2026-03' }],
    ['an id where a month belongs', { table: 'cashActuals', after: '7' }],
    ['a month that is not one', { table: 'cashActuals', after: '2026-13' }],
    ['a statement position with no account', { table: 'accountStatements', after: '2026-03' }],
    ['a position in the settings, which have only one row', { table: 'settings', after: '1' }],
    ['a limit of zero', { table: 'transactions', limit: '0' }],
    ['a limit that is not a number', { table: 'transactions', limit: 'many' }],
    ['a fractional limit', { table: 'transactions', limit: '1.5' }],
    ['a negative limit', { table: 'transactions', limit: '-1' }],
    ['a limit over the bound', { table: 'transactions', limit: String(EXPORT_CHUNK_ROWS.transactions + 1) }],
    ['a limit over a small table’s bound', { table: 'categories', limit: '1001' }],
    ['a limit over the settings’ one row', { table: 'settings', limit: '2' }],
  ])('refuses %s', (_name, raw) => {
    expect(refused(() => parseExportRequest(raw))).not.toBe('accepted')
  })

  it('says which tables there are', () => {
    expect(refused(() => parseExportRequest({ table: 'x' }))).toBe(`table must be one of ${EXPORT_TABLES.join(', ')}`)
  })

  it('names the bound when a limit is over it', () => {
    expect(refused(() => parseExportRequest({ table: 'transactions', limit: '5001' }))).toBe(
      'limit must be a whole number from 1 to 5000 for transactions',
    )
  })

  it('has a bound for every table, so no table can be read in one unbounded request', () => {
    expect(Object.keys(EXPORT_CHUNK_ROWS).sort()).toEqual([...EXPORT_TABLES].sort())
    for (const bound of Object.values(EXPORT_CHUNK_ROWS)) expect(bound).toBeGreaterThan(0)
  })
})

describe('readExport', () => {
  it('hands the request to the repository', async () => {
    const repo = inMemoryExpenseRepository(
      { categories: [1, 2, 3].map((id) => ({ id, name: `C${id}`, monthlyBudgetCents: 0, sortOrder: id, active: true })) },
      'owner@example.com',
    )

    const chunk = await readExport(repo, 'owner@example.com', { table: 'categories', limit: 2 })

    expect(chunk.rows.map((r) => (r as { id: number }).id)).toEqual([1, 2])
    expect(chunk.next).toBe('2')
  })
})
