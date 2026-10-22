import { describe, expect, it } from 'vitest'
import { MAX_CASE_FOLDS, MAX_FILTER_LABELS } from '../domain/data/transactionQuery'
import type { TxnFilter } from '../domain/engine/transactions'
import { countSql, idsSql, matchGuardSql, netSpendSql, oneSql, pageSql } from './transactionQuerySql'

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

describe('the statements of a bulk edit', () => {
  const flat = (sql: string): string => sql.replace(/\s+/g, ' ')
  const whereOf = (sql: string): string =>
    flat(sql).slice(flat(sql).lastIndexOf('WHERE t.owner'), flat(sql).search(/ ORDER BY | LIMIT /))
  const filters: TxnFilter[] = [{}, { month: '2026-09' }, { status: 'forecast', labelIds: [1, 2] }, everything]

  it('find the rows under the list’s own conditions, with the same values in the same order', () => {
    for (const filter of filters) {
      const list = pageSql(OWNER, filter, 10)
      const ids = idsSql(OWNER, filter, 5_001)

      expect(whereOf(ids.sql)).toBe(whereOf(list.sql))
      expect(ids.params).toEqual(list.params.slice(0, -1))
    }
  })

  it('read the owner’s rows only, and stop at the limit', () => {
    const { sql, params } = idsSql(OWNER, { month: '2026-09' }, 5_001)

    expect(flat(sql)).toBe('SELECT t.id FROM transactions t WHERE t.owner = ? AND t.budget_month = ? LIMIT 5001')
    expect(params).toEqual([OWNER, '2026-09'])
  })

  it('join the account and statement only when the filter asks about status', () => {
    expect(idsSql(OWNER, { month: '2026-09' }, 10).sql).not.toContain('JOIN')
    expect(idsSql(OWNER, { status: 'posted' }, 10).sql).toContain('LEFT JOIN accounts')
  })

  it('send the ids to the guard as one JSON string, and bind a few values whatever the filter holds', () => {
    const ids = Array.from({ length: 5_000 }, (_, i) => i + 1)

    const { sql, params } = matchGuardSql(OWNER, everything, ids, 5_000)

    expect(params.filter((p) => p === JSON.stringify(ids))).toHaveLength(1)
    expect(params.at(-3)).toBe(5_000)
    expect(params.at(-1)).toBe(5_000)
    expect(params.length).toBeLessThanOrEqual(45)
    expect(sql.match(/\?/g)?.length).toBe(params.length)
  })

  it('read the filter once, up to one row past the cap, and fail unless exactly the ids match', () => {
    const { sql } = matchGuardSql(OWNER, { month: '2026-09' }, [1, 2, 3], 5_000)

    expect(sql.match(/FROM transactions t/g)).toHaveLength(1)
    expect(sql).toContain('LIMIT 5001')
    expect(sql).toContain('(SELECT COUNT(*) FROM m) = ?')
    expect(sql).toContain('(SELECT COUNT(*) FROM m WHERE id IN (SELECT value FROM json_each(?))) = ?')
    expect(sql).toContain('abs(-9223372036854775808)')
  })
})
