import { describe, expect, it } from 'vitest'
import { EXPORT_TABLES } from '../domain/data/exportTables'
import { exportSql } from './exportSql'

const OWNER = 'owner@example.com'

describe('the statement for a chunk', () => {
  it.each(EXPORT_TABLES.filter((t) => t !== 'settings'))('%s: owner first, primary-key order, one row past the limit', (table) => {
    const { sql, params } = exportSql(table, OWNER, undefined, 50)

    expect(sql).toMatch(/\bowner = \?/)
    expect(sql).toMatch(/ORDER BY (t\.id|id|year_month|account_id, year_month)\b/)
    expect(sql).toMatch(/LIMIT \?$/)
    expect(params[0]).toBe(OWNER)
    expect(params.at(-1)).toBe(51)
  })

  it('reads the settings row of the owner and nothing else', () => {
    expect(exportSql('settings', OWNER, undefined, 1)).toEqual({ sql: 'SELECT * FROM settings WHERE owner = ?', params: [OWNER] })
  })

  it('continues after the position it was given, as a number or text as the key is', () => {
    expect(exportSql('categories', OWNER, '17', 10).params).toEqual([OWNER, 17, 11])
    expect(exportSql('transactions', OWNER, '4000', 10).params).toEqual([OWNER, 4000, 11])
    expect(exportSql('cashActuals', OWNER, '2026-03', 10).params).toEqual([OWNER, '2026-03', 11])
    expect(exportSql('accountStatements', OWNER, '3:2026-03', 10).params).toEqual([OWNER, 3, '2026-03', 11])
    expect(exportSql('accountStatements', OWNER, '3:2026-03', 10).sql).toContain('(account_id, year_month) > (?, ?)')
  })

  it('starts from the first row when there is no position', () => {
    expect(exportSql('labels', OWNER, undefined, 10).sql).not.toContain('id > ?')
    expect(exportSql('transactions', OWNER, undefined, 10).params).toEqual([OWNER, 0, 11])
  })

  it('binds only values from the caller, in a fixed number, whatever the table', () => {
    for (const table of EXPORT_TABLES) {
      const { sql, params } = exportSql(table, OWNER, table === 'accountStatements' ? '9:2026-12' : table === 'cashActuals' ? '2026-12' : table === 'settings' ? undefined : '9', 1_000)
      expect(sql.match(/\?/g)?.length).toBe(params.length)
      expect(params.length).toBeLessThanOrEqual(4)
    }
  })
})
