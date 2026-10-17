/**
 * What happens to `description_norm` when code from before the column edits a description, as a rolled-back
 * deploy or an older preview sharing the database does: the stored value goes stale, and since only NULL rows
 * are ever filled it stays stale. The repair in docs/DEPLOYMENT.md is tested here, and the docs are held to the
 * statements the test runs.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeDesc } from '../../src/domain/engine/recurringDetect'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { OWNER, queryDb } from '../../src/testing/transactionQueryKit'
import {
  REPAIR_ALL_SQL,
  REPAIR_SINCE_SQL,
  REVISION_RESET_SQL,
  fillDescriptionNorm,
  hasPendingDescriptionNorm,
} from './descriptionNormBackfill'

const ROLLBACK_START = '2026-10-17 12:00:00'

interface Stored {
  id: number
  description: string
  description_norm: string | null
}

function database() {
  const kit = queryDb(syntheticLedger({ months: 3, perMonth: 12, seed: 3 }))
  kit.sqlite.exec("UPDATE transactions SET updated_at = '2026-10-01 08:00:00'")
  return kit
}

type Kit = ReturnType<typeof database>

const rows = (kit: Kit): Stored[] =>
  kit.sqlite.prepare('SELECT id, description, description_norm FROM transactions ORDER BY id').all() as unknown as Stored[]

const stale = (kit: Kit): Stored[] => rows(kit).filter((r) => r.description_norm !== normalizeDesc(r.description))

/** What the previous release does to a row: it sets the description and knows nothing of the column. */
function editLikeOldCode(kit: Kit, ids: number[]): void {
  for (const id of ids) {
    kit.sqlite
      .prepare("UPDATE transactions SET description = ?, updated_at = '2026-10-17 13:00:00' WHERE id = ?")
      .run(`Edited by old code ${id}`, id)
  }
}

function insertLikeOldCode(kit: Kit): number {
  const info = kit.sqlite
    .prepare(
      "INSERT INTO transactions (owner, date, budget_month, description, account_id, category_id, type, amount_cents, cancelled, created_at) VALUES (?, '2026-10-17', '2026-10', 'Added by old code', 1, 1, 'expense', 100, 0, '2026-10-17T13:00:00Z')",
    )
    .run(OWNER)
  return Number(info.lastInsertRowid)
}

describe('rows written by code from before the column', () => {
  it('an insert is simply waiting, and the fill picks it up', async () => {
    const kit = database()
    const id = insertLikeOldCode(kit)
    expect(await hasPendingDescriptionNorm(kit.d1, OWNER)).toBe(true)
    await fillDescriptionNorm(kit.d1, OWNER)
    expect(rows(kit).find((r) => r.id === id)?.description_norm).toBe('added by old code')
    expect(stale(kit)).toEqual([])
  })

  it('an edit leaves a stale value that the fill does not see: this is why a roll-forward needs the repair', async () => {
    const kit = database()
    const ids = rows(kit).slice(0, 4).map((r) => r.id)
    editLikeOldCode(kit, ids)
    expect(stale(kit).map((r) => r.id)).toEqual(ids)
    expect(await hasPendingDescriptionNorm(kit.d1, OWNER)).toBe(false)
    expect(await fillDescriptionNorm(kit.d1, OWNER)).toEqual({ filled: 0, pending: false })
    expect(stale(kit)).toHaveLength(4)
  })
})

describe('the repair after rolling forward', () => {
  it('clearing every value and letting the next read refill them makes all of them right again', async () => {
    const kit = database()
    editLikeOldCode(kit, rows(kit).slice(0, 4).map((r) => r.id))
    insertLikeOldCode(kit)
    kit.sqlite.exec(REPAIR_ALL_SQL)
    expect(rows(kit).every((r) => r.description_norm === null)).toBe(true)
    while ((await fillDescriptionNorm(kit.d1, OWNER)).pending) continue
    expect(stale(kit)).toEqual([])
  })

  it('clearing only the rows updated since the rollback began is enough', async () => {
    const kit = database()
    const edited = rows(kit).slice(0, 4).map((r) => r.id)
    editLikeOldCode(kit, edited)
    kit.sqlite.exec(REPAIR_SINCE_SQL.replace('<when the rollback began, UTC>', ROLLBACK_START))
    const cleared = rows(kit).filter((r) => r.description_norm === null).map((r) => r.id)
    expect(cleared).toEqual(edited)
    await fillDescriptionNorm(kit.d1, OWNER)
    expect(stale(kit)).toEqual([])
  })

  it('a time that is too late leaves them stale, which is why the full form is the default', () => {
    const kit = database()
    editLikeOldCode(kit, rows(kit).slice(0, 2).map((r) => r.id))
    kit.sqlite.exec(REPAIR_SINCE_SQL.replace('<when the rollback began, UTC>', '2027-01-01 00:00:00'))
    expect(stale(kit)).toHaveLength(2)
  })
})

describe('docs/DEPLOYMENT.md', () => {
  const doc = readFileSync(join(import.meta.dirname, '..', '..', 'docs', 'DEPLOYMENT.md'), 'utf8')

  it('quotes the statements the repair test runs, so the runbook cannot drift from what is tested', () => {
    for (const statement of [REPAIR_ALL_SQL, REPAIR_SINCE_SQL, REVISION_RESET_SQL]) {
      expect(doc, statement).toContain(statement)
    }
  })
})
