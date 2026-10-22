// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PRODUCTION_DATABASE,
  SYNTHETIC_OWNER,
  assertConfirmed,
  assertSafeTarget,
  assertStatementAllowed,
  classifyStatement,
  productionDatabaseIds,
} from './guard'

const DEV = { d1DatabaseId: 'dev-id-1', d1DatabaseName: 'roy-expenses-dev' }

describe('the production database id', () => {
  it('is found in the backup worker config the repository ships', () => {
    const toml = readFileSync(join(import.meta.dirname, '../../workers/backup-cron/wrangler.toml'), 'utf8')
    const ids = productionDatabaseIds(toml)
    expect(ids).toHaveLength(1)
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('reads only blocks named for production', () => {
    const toml = [
      '[[d1_databases]]', 'binding = "DB"', 'database_name = "roy-expenses"', 'database_id = "aaa"',
      '[[d1_databases]]', 'binding = "DEV"', 'database_name = "roy-expenses-dev"', 'database_id = "bbb"',
    ].join('\n')
    expect(productionDatabaseIds(toml)).toEqual(['aaa'])
    expect(productionDatabaseIds('name = "x"')).toEqual([])
  })
})

describe('the target', () => {
  const ok = { database: 'roy-expenses-dev', dev: DEV, productionIds: ['prod-id'] }

  it('accepts the development database named in config/dev.json', () => {
    expect(() => assertSafeTarget(ok)).not.toThrow()
    expect(() => assertSafeTarget({ ...ok, resolved: { uuid: 'dev-id-1', name: 'roy-expenses-dev' } })).not.toThrow()
  })

  it.each([
    ['production by name', { database: PRODUCTION_DATABASE }],
    ['an empty name', { database: '' }],
    ['a name that does not end in -dev', { database: 'staging' }],
    ['a database other than the one in config/dev.json', { database: 'other-dev' }],
    ['a dev config holding the production id', { productionIds: ['dev-id-1'] }],
    ['an id Cloudflare names differently', { resolved: { uuid: 'someone-else', name: 'roy-expenses-dev' } }],
    ['a name Cloudflare reports differently', { resolved: { uuid: 'dev-id-1', name: 'roy-expenses' } }],
  ])('refuses %s', (_label, override) => {
    expect(() => assertSafeTarget({ ...ok, ...override })).toThrow(/Refusing/)
  })

  it('refuses production even when config/dev.json points at it', () => {
    const dev = { d1DatabaseId: 'prod-id', d1DatabaseName: PRODUCTION_DATABASE }
    expect(() => assertSafeTarget({ database: PRODUCTION_DATABASE, dev, productionIds: ['prod-id'] })).toThrow(/production/)
  })

  it('wants the database name typed again before any write', () => {
    expect(() => assertConfirmed('roy-expenses-dev', 'roy-expenses-dev')).not.toThrow()
    expect(() => assertConfirmed('roy-expenses-dev', undefined)).toThrow(/--confirm/)
    expect(() => assertConfirmed('roy-expenses-dev', 'roy-expenses')).toThrow(/--confirm/)
    expect(() => assertConfirmed('', undefined)).toThrow(/<database>/)
  })
})

describe('what a statement is', () => {
  it.each([
    ['SELECT * FROM transactions WHERE owner = ?', 'read'],
    ['select replace(description, ?, ?) from transactions', 'read'],
    ['WITH x AS (SELECT 1) SELECT * FROM x', 'read'],
    ['PRAGMA index_list(transactions)', 'read'],
    ['EXPLAIN QUERY PLAN SELECT 1', 'read'],
    ['SELECT created_at, updated_at FROM transactions', 'read'],
    ['INSERT INTO transactions (owner) VALUES (?)', 'write'],
    ['  update transactions set x = 1', 'write'],
    ['DELETE FROM transactions', 'write'],
    ['INSERT OR REPLACE INTO settings (owner) VALUES (?)', 'write'],
    ['WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x', 'write'],
    ['-- harmless\nDELETE FROM transactions', 'write'],
    ['CREATE INDEX i ON t (a)', 'ddl'],
    ['DROP TABLE transactions', 'ddl'],
    ['ALTER TABLE transactions ADD COLUMN x', 'ddl'],
    ['PRAGMA foreign_keys = OFF', 'ddl'],
    ['ANALYZE', 'ddl'],
    ['VACUUM', 'ddl'],
  ])('%s is %s', (sql, kind) => {
    expect(classifyStatement(sql)).toBe(kind)
  })
})

describe('which statements may be sent', () => {
  it('lets every read through, with or without --write', () => {
    expect(() => assertStatementAllowed('SELECT 1', [], false)).not.toThrow()
    expect(() => assertStatementAllowed('SELECT * FROM transactions', [], true)).not.toThrow()
  })

  it('refuses every write without --write, even one for the synthetic owner', () => {
    expect(() => assertStatementAllowed('DELETE FROM transactions WHERE owner = ?', [SYNTHETIC_OWNER], false)).toThrow(/without --write/)
  })

  it('refuses a write that names no owner, or binds someone else', () => {
    expect(() => assertStatementAllowed('DELETE FROM transactions', [SYNTHETIC_OWNER], true)).toThrow(/names no owner/)
    expect(() => assertStatementAllowed('DELETE FROM transactions WHERE owner = ?', ['someone@example.com'], true)).toThrow(/synthetic owner/)
    expect(() => assertStatementAllowed('UPDATE transactions SET x = 1 WHERE owner = ?', [], true)).toThrow(/synthetic owner/)
  })

  it('lets an owner-scoped write for the synthetic owner through once writes are enabled', () => {
    expect(() => assertStatementAllowed('DELETE FROM transactions WHERE owner = ?', [SYNTHETIC_OWNER], true)).not.toThrow()
    expect(() => assertStatementAllowed('DELETE FROM allowed_users WHERE email = ?', [SYNTHETIC_OWNER], true)).not.toThrow()
  })

  it('never lets the schema change', () => {
    expect(() => assertStatementAllowed('DROP TABLE transactions', [SYNTHETIC_OWNER], true)).toThrow(/schema/)
    expect(() => assertStatementAllowed('CREATE INDEX i ON transactions (owner)', [SYNTHETIC_OWNER], true)).toThrow(/schema/)
  })

  it('uses an address under example.com, which RFC 2606 reserves and check-pii accepts', () => {
    expect(SYNTHETIC_OWNER).toMatch(/^[a-z-]+@example\.com$/)
  })
})
