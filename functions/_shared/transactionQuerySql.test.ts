import { describe, expect, it } from 'vitest'
import { MAX_CASE_FOLDS, MAX_FILTER_LABELS } from '../domain/data/transactionQuery'
import type { TxnFilter } from '../domain/engine/transactions'
import { countSql, netSpendSql, oneSql, pageSql } from './transactionQuerySql'

const OWNER = 'owner@example.com'
const AFTER = { date: '2026-06-15', id: 1_500 }

const everything: TxnFilter = {
  month: '2026-03',
  dateFrom: '2026-01-01',
  dateTo: '2026-03-31',
  categoryId: 3,
  accountId: 3,
  type: 'expense',
  status: 'forecast',
  flagId: 1,
  labelIds: Array.from({ length: MAX_FILTER_LABELS }, (_, i) => i + 1),
  amountMinCents: 1,
  amountMaxCents: 90_000,
  query: 'éèêëàâäôöûüçñ'.slice(0, MAX_CASE_FOLDS),
  queryAmount: { fromCents: 1, toCents: 99 },
}

describe('the bound values of a statement', () => {
  it('stay a small, fixed number whatever the filter holds, far below the 100 D1 allows', () => {
    const statements = [
      pageSql(OWNER, everything, 200, AFTER),
      countSql(OWNER, everything),
      netSpendSql(OWNER, everything),
    ]
    for (const { sql, params } of statements) {
      expect(params.length).toBeLessThanOrEqual(40)
      expect(sql.match(/\?/g)?.length).toBe(params.length)
    }
  })

  it('send the label list as one JSON string, not one value per label', () => {
    const { params } = pageSql(OWNER, { labelIds: [4, 5, 6] }, 10)
    expect(params).toEqual([OWNER, OWNER, '[4,5,6]', 11])
  })

  it('carry the owner from the caller, never from the filter', () => {
    const forged = { ...everything, owner: 'victim@example.com' } as TxnFilter
    for (const { sql, params } of [pageSql(OWNER, forged, 5), countSql(OWNER, forged), oneSql(OWNER, 7)]) {
      expect(params).toContain(OWNER)
      expect(params).not.toContain('victim@example.com')
      expect(sql).toMatch(/t\.owner = \?/)
    }
  })

  it('never put text from the request into the SQL itself', () => {
    const hostile: TxnFilter = { query: "x'); DROP TABLE transactions; --", month: "2026-01' OR '1'='1" }
    const { sql, params } = pageSql(OWNER, hostile, 5)
    expect(sql).not.toMatch(/DROP|OR '1'/)
    expect(params).toContain("x'); drop table transactions; --")
  })
})
