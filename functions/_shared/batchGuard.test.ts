import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { migratedDatabase, sqliteD1 } from '../../src/testing/sqliteD1'
import { guardSql, isGuardFailure } from './batchGuard'

let db: DatabaseSync
let d1: D1Database

const labelCount = (): number =>
  (db.prepare('SELECT COUNT(*) AS n FROM labels').get() as { n: number }).n

beforeEach(() => {
  db = migratedDatabase()
  d1 = sqliteD1(db) as unknown as D1Database
})

const insertLabel = (name: string) =>
  d1.prepare("INSERT INTO labels (owner, name, color, sort_order, active) VALUES ('o', ?, '#10b981', 0, 1)").bind(name)

describe('guardSql', () => {
  it('lets the batch through when the condition holds', async () => {
    await d1.batch([insertLabel('a'), d1.prepare(guardSql('1 = 1')), insertLabel('b')])

    expect(labelCount()).toBe(2)
  })

  it('fails the batch, and undoes what came before it, when the condition does not hold', async () => {
    const failed = d1.batch([insertLabel('a'), d1.prepare(guardSql('1 = 2')), insertLabel('b')])

    const error = await failed.then(
      () => null,
      (e: unknown) => e,
    )
    expect(isGuardFailure(error)).toBe(true)
    expect(labelCount()).toBe(0)
  })

  it('sees the writes before it in the same batch', async () => {
    const count = '(SELECT COUNT(*) FROM labels)'

    await d1.batch([insertLabel('a'), insertLabel('b'), d1.prepare(guardSql(`${count} = 2`))])
    expect(labelCount()).toBe(2)

    const failed = d1.batch([insertLabel('c'), d1.prepare(guardSql(`${count} = 2`))])
    await expect(failed).rejects.toSatisfy(isGuardFailure)
    expect(labelCount()).toBe(2)
  })
})

describe('isGuardFailure', () => {
  it('recognises the text D1 returns for the guard, with or without the prefix a Worker binding may add', () => {
    // "integer overflow: SQLITE_ERROR" (code 7500) is what D1's REST API returns for the guard.
    expect(isGuardFailure(new Error('integer overflow: SQLITE_ERROR'))).toBe(true)
    expect(isGuardFailure(new Error('D1_ERROR: integer overflow: SQLITE_ERROR'))).toBe(true)
    expect(isGuardFailure(new Error('D1_ERROR: Integer Overflow'))).toBe(true)
    expect(isGuardFailure(new Error('batch failed', { cause: new Error('Integer Overflow') }))).toBe(true)
  })

  it('recognises what a real batch raises when its guard fails', async () => {
    const error = await d1.batch([insertLabel('a'), d1.prepare(guardSql('1 = 2'))]).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Error)
    expect(isGuardFailure(error)).toBe(true)
  })

  it('does not take any other failure of a batch for a guard, whatever it is', async () => {
    d1 = sqliteD1(db, undefined, { maxBoundParameters: 2 }) as unknown as D1Database
    db.prepare("INSERT INTO owner_revision (owner, token) VALUES ('dup', 'x')").run()
    const failures: Array<[string, () => D1PreparedStatement[]]> = [
      ['a unique constraint', () => [d1.prepare("INSERT INTO owner_revision (owner, token) VALUES ('dup', 'y')")]],
      ['a missing value', () => [d1.prepare("INSERT INTO labels (owner) VALUES ('o')")]],
      ['a foreign key', () => [d1.prepare('INSERT INTO transaction_labels (transaction_id, label_id) VALUES (99, 99)')]],
      ['a table that is not there', () => [d1.prepare('SELECT * FROM no_such_table')]],
      ['too many bound values', () => [d1.prepare('SELECT ?, ?, ?').bind(1, 2, 3)]],
      ['text that is not JSON', () => [d1.prepare("SELECT value FROM json_each('{ nope')")]],
    ]
    for (const [name, build] of failures) {
      // The stand-in prepares eagerly, so a statement that cannot be prepared fails here and not in the batch.
      const error = await (async () => d1.batch([insertLabel('before'), ...build()]))().catch((e: unknown) => e)

      expect(error, name).toBeInstanceOf(Error)
      expect(isGuardFailure(error), `${name}: ${(error as Error).message}`).toBe(false)
    }
    expect(labelCount()).toBe(0)
  })

  it('does not take any other failure for a guard', () => {
    expect(isGuardFailure(new Error('D1_ERROR: network lost'))).toBe(false)
    expect(isGuardFailure(new Error('batch failed', { cause: new Error('too many SQL variables') }))).toBe(false)
    expect(isGuardFailure('integer overflow')).toBe(false)
    expect(isGuardFailure(undefined)).toBe(false)
  })
})
