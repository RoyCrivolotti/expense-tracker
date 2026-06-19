import { describe, expect, it, vi } from 'vitest'
import { purgeOwnerExpenseData } from './ownerDataPurge'

describe('purgeOwnerExpenseData', () => {
  it('deletes all tenant tables for the owner email', async () => {
    const batch = vi.fn().mockResolvedValue(undefined)
    const prepare = vi.fn((sql: string) => ({ sql, bind: vi.fn().mockReturnThis() }))
    const db = { prepare, batch } as unknown as D1Database

    await purgeOwnerExpenseData(db, 'Guest@Example.com')

    expect(batch).toHaveBeenCalledOnce()
    const statements = batch.mock.calls[0]?.[0] as Array<{ sql: string }>
    expect(statements.map((s) => s.sql)).toEqual([
      'DELETE FROM transactions WHERE owner = ?',
      'DELETE FROM account_statements WHERE owner = ?',
      'DELETE FROM cash_actuals WHERE owner = ?',
      'DELETE FROM categories WHERE owner = ?',
      'DELETE FROM accounts WHERE owner = ?',
      'DELETE FROM settings WHERE owner = ?',
      'DELETE FROM goal_inputs WHERE owner = ?',
      'DELETE FROM access_requests WHERE email = ?',
    ])
  })
})
