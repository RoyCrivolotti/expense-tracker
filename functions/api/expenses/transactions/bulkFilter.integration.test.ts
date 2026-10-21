// @vitest-environment node
/**
 * Bulk edit on a filter and bulk labels, through the real auth middleware and revision bumps, the real
 * application layer and the D1 adapter on SQLite with the real migrations, over a database that holds two
 * owners. What the user looked at is the summary's count and revision; the edit is refused if either moved.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import {
  BULK_REVISION_MESSAGE,
  MAX_BULK_LABEL_LINKS,
  MAX_FILTER_EDIT_ROWS,
  bulkCountMessage,
  bulkTooManyLinksMessage,
  bulkTooManyMessage,
} from '../../../../src/domain/data/bulkEdit'
import { seedDataset } from '../../../../src/testing/seedSqlite'
import { migratedDatabase, newStats, sqliteD1 } from '../../../../src/testing/sqliteD1'
import { syntheticLedger } from '../../../../src/testing/syntheticLedger'
import { shifted } from '../../../../src/testing/transactionQueryKit'
import { OTHER, OWNER, createExpenseWorld, pinClock, type World } from '../../../_shared/testing/expenseWorld'
import { onRequestGet as getDataset } from '../index'
import { onRequestPut as putSettings } from '../settings/index'
import { onRequestDelete as deleteBulk, onRequestPatch as patchBulk } from './bulk'
import { onRequestPost as postLabels } from './bulk/labels'
import { onRequestGet as getSummary } from './summary'

let world: World
let sqlite: DatabaseSync
const theirs = shifted(syntheticLedger({ months: 4, perMonth: 15, seed: 2 }), 1_000_000)

beforeEach(() => {
  pinClock('2026-10-15')
  sqlite = migratedDatabase()
  sqlite.exec('PRAGMA foreign_keys = OFF')
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  seedDataset(sqlite, OWNER, syntheticLedger({ months: 4, perMonth: 15, seed: 1 }))
  seedDataset(sqlite, OTHER, theirs)
})

afterEach(() => {
  vi.useRealTimers()
})

interface Looked {
  revision: string
  count: number
}

async function look(query: string, email = OWNER): Promise<Looked> {
  const response = await world.call(getSummary, { path: `/transactions/summary?${query}`, email })
  expect(response.status).toBe(200)
  return (await response.json()) as Looked
}

const patch = (body: unknown, email = OWNER) =>
  world.call(patchBulk, { method: 'PATCH', path: '/transactions/bulk', body, email })

const label = (body: unknown, email = OWNER) =>
  world.call(postLabels, { method: 'POST', path: '/transactions/bulk/labels', body, email })

const message = async (response: Response): Promise<string> => ((await response.json()) as { error: string }).error

const rows = (owner: string, where = '1 = 1'): unknown[] =>
  sqlite
    .prepare(`SELECT id, date, budget_month, description, account_id, category_id, type, flag_id, settled_by FROM transactions WHERE owner = ? AND ${where} ORDER BY id`)
    .all(owner)

const firstMonth = (): string => (sqlite.prepare('SELECT MIN(budget_month) AS m FROM transactions WHERE owner = ?').get(OWNER) as { m: string }).m
const idsIn = (month: string): number[] =>
  (sqlite.prepare('SELECT id FROM transactions WHERE owner = ? AND budget_month = ? ORDER BY id').all(OWNER, month) as Array<{ id: number }>).map((r) => r.id)

describe('PATCH /transactions/bulk with a filter', () => {
  it('edits the rows the summary counted, once the user confirms the count and the revision', async () => {
    const month = firstMonth()
    const looked = await look(`month=${month}`)
    const before = rows(OTHER)

    const response = await patch({
      filter: { month },
      expectedCount: looked.count,
      expectedRevision: looked.revision,
      patch: { description: 'Renamed in bulk' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ updated: looked.count })
    expect(rows(OWNER, "description = 'Renamed in bulk'").map((r) => (r as { id: number }).id)).toEqual(idsIn(month))
    expect(rows(OTHER)).toEqual(before)
  })

  it('moves the revision and the dataset’s ETag, like every other write', async () => {
    const month = firstMonth()
    // Reading the dataset may insert instalments that have fallen due, which is a write; do it first.
    const etag = (await world.call(getDataset)).headers.get('etag')
    const looked = await look(`month=${month}`)
    const token = world.token()

    const response = await patch({ filter: { month }, expectedCount: looked.count, expectedRevision: looked.revision, patch: { categoryId: 2 } })

    expect(response.status).toBe(200)
    expect(world.token()).not.toBe(token)
    expect((await world.call(getDataset)).headers.get('etag')).not.toBe(etag)
  })

  it('names the same revision as the summary, which is the owner’s token', async () => {
    const looked = await look('')

    expect(looked.revision).toBe(world.token())
  })

  it('is refused, and changes nothing, once anything else has been written since the user looked', async () => {
    const month = firstMonth()
    const looked = await look(`month=${month}`)
    expect((await world.call(putSettings, { method: 'PUT', path: '/settings', body: { openingCashCents: 5_000 } })).status).toBe(200)
    const before = rows(OWNER)

    const response = await patch({ filter: { month }, expectedCount: looked.count, expectedRevision: looked.revision, patch: { description: 'Late' } })

    expect(response.status).toBe(409)
    expect(await message(response)).toBe(BULK_REVISION_MESSAGE)
    expect(rows(OWNER)).toEqual(before)
  })

  it('lets only one of two tabs that looked at the same moment through', async () => {
    const month = firstMonth()
    const looked = await look(`month=${month}`)
    const body = (description: string) => ({ filter: { month }, expectedCount: looked.count, expectedRevision: looked.revision, patch: { description } })

    expect((await patch(body('First tab'))).status).toBe(200)
    const second = await patch(body('Second tab'))

    expect(second.status).toBe(409)
    expect(rows(OWNER, "description = 'Second tab'")).toEqual([])
    expect(rows(OWNER, "description = 'First tab'")).toHaveLength(looked.count)
  })

  it('is refused when the count is not the one shown, even at the right revision', async () => {
    const month = firstMonth()
    const looked = await look(`month=${month}`)

    const response = await patch({ filter: { month }, expectedCount: looked.count + 1, expectedRevision: looked.revision, patch: { description: 'x' } })

    expect(response.status).toBe(409)
    expect(await message(response)).toBe(bulkCountMessage(looked.count, looked.count + 1))
    expect(rows(OWNER, "description = 'x'")).toEqual([])
  })

  it('is refused for another owner who offers this owner’s revision, and edits only their own rows with theirs', async () => {
    const mine = await look('')
    const theirView = await look('', OTHER)
    const before = rows(OWNER)

    const borrowed = await patch({ filter: {}, expectedCount: theirView.count, expectedRevision: mine.revision, patch: { description: 'Theirs' } }, OTHER)
    expect(borrowed.status).toBe(409)
    expect(await message(borrowed)).toBe(BULK_REVISION_MESSAGE)

    // The refused request was a write request, so it moved their revision too: they look again.
    const again = await look('', OTHER)
    const own = await patch({ filter: {}, expectedCount: again.count, expectedRevision: again.revision, patch: { description: 'Theirs' } }, OTHER)
    expect(own.status).toBe(200)
    expect(rows(OWNER)).toEqual(before)
    expect(rows(OTHER, "description = 'Theirs'")).toHaveLength(theirView.count)
  })

  it('is refused for an account of another owner in the patch', async () => {
    const looked = await look('')
    const foreign = (theirs.accounts[0] as { id: number }).id

    const response = await patch({ filter: {}, expectedCount: looked.count, expectedRevision: looked.revision, patch: { accountId: foreign } })

    expect(response.status).toBe(400)
    expect(await message(response)).toBe('Invalid accountId')
    expect(rows(OWNER, `account_id = ${foreign}`)).toEqual([])
  })

  it.each([
    ['ids as well as a filter', { ids: [1], filter: {}, expectedCount: 1, expectedRevision: 'r', patch: { categoryId: 1 } }, 'Give ids or a filter, not both'],
    ['a filter field it does not know', { filter: { owner: OTHER }, expectedCount: 1, expectedRevision: 'r', patch: { categoryId: 1 } }, 'Unknown filter: owner'],
    ['no revision', { filter: {}, expectedCount: 1, patch: { categoryId: 1 } }, 'expectedRevision must be the revision you were given'],
    ['no count', { filter: {}, expectedRevision: 'r', patch: { categoryId: 1 } }, 'expectedCount must be the number of transactions you were shown'],
    ['no patch', { filter: {}, expectedCount: 1, expectedRevision: 'r' }, 'patch is required'],
    ['a field a bulk edit may not touch', { filter: {}, expectedCount: 1, expectedRevision: 'r', patch: { amountCents: 1 } }, 'Field "amountCents" is not bulk-editable'],
    ['a filter that is not an object', { filter: 'month=2026-09', expectedCount: 1, expectedRevision: 'r', patch: { categoryId: 1 } }, 'filter must be an object'],
  ])('answers 400 for %s', async (_name, body, expected) => {
    const before = rows(OWNER)

    const response = await patch(body)

    expect(response.status).toBe(400)
    expect(await message(response)).toBe(expected)
    expect(rows(OWNER)).toEqual(before)
  })

  it('answers 401 with no signed-in user', async () => {
    const response = await world.call(patchBulk, { method: 'PATCH', path: '/transactions/bulk', body: { filter: {} }, email: '' })

    expect(response.status).toBe(401)
  })

  it('still takes the ids form, which is not told apart by the revision', async () => {
    const ids = idsIn(firstMonth()).slice(0, 3)

    const response = await patch({ ids, patch: { description: 'By ids' } })

    expect(response.status).toBe(200)
    expect(((await response.json()) as { updated: number }).updated).toBe(3)
  })
})

describe('the cap and the count the summary shows', () => {
  /** `count` rows in a month nothing else is in, on the owner's first account and category. */
  function fill(count: number): void {
    const { account_id: accountId, category_id: categoryId } = sqlite
      .prepare('SELECT account_id, category_id FROM transactions WHERE owner = ? LIMIT 1')
      .get(OWNER) as { account_id: number; category_id: number }
    const insert = sqlite.prepare(
      `INSERT INTO transactions (owner,date,budget_month,description,account_id,category_id,type,amount_cents,cancelled)
       VALUES (?,'2030-01-10','2030-01','Cap',?,?,'expense',100,0)`,
    )
    sqlite.exec('BEGIN')
    for (let i = 0; i < count; i += 1) insert.run(OWNER, accountId, categoryId)
    sqlite.exec('COMMIT')
  }

  it('lets a filter be edited exactly when the summary can count it, and refuses one it can only say is over', async () => {
    fill(MAX_FILTER_EDIT_ROWS)
    const exact = (await (await world.call(getSummary, { path: '/transactions/summary?month=2030-01' })).json()) as Looked & { capped: boolean }
    expect(exact).toMatchObject({ count: MAX_FILTER_EDIT_ROWS, capped: false })

    const edited = await patch({ filter: { month: '2030-01' }, expectedCount: exact.count, expectedRevision: exact.revision, patch: { description: 'Edited' } })
    expect(edited.status).toBe(200)
    expect(await edited.json()).toEqual({ updated: MAX_FILTER_EDIT_ROWS })

    fill(1)
    const over = (await (await world.call(getSummary, { path: '/transactions/summary?month=2030-01' })).json()) as Looked & { capped: boolean }
    expect(over).toMatchObject({ count: MAX_FILTER_EDIT_ROWS, capped: true })
    const refused = await patch({ filter: { month: '2030-01' }, expectedCount: over.count, expectedRevision: over.revision, patch: { description: 'Again' } })
    expect(refused.status).toBe(400)
    expect(await message(refused)).toBe(bulkTooManyMessage())
    expect(rows(OWNER, "description = 'Again'")).toEqual([])
  })
})

describe('DELETE /transactions/bulk', () => {
  it('has no filter form: it still wants ids', async () => {
    const before = rows(OWNER)

    const response = await world.call(deleteBulk, {
      method: 'DELETE',
      path: '/transactions/bulk',
      body: { filter: {}, expectedCount: 1, expectedRevision: 'r' },
    })

    expect(response.status).toBe(400)
    expect(await message(response)).toBe('ids must be an array')
    expect(rows(OWNER)).toEqual(before)
  })
})

describe('POST /transactions/bulk/labels', () => {
  const labelsOf = (id: number): number[] =>
    (sqlite.prepare('SELECT label_id FROM transaction_labels WHERE transaction_id = ? ORDER BY label_id').all(id) as Array<{ label_id: number }>).map((r) => r.label_id)
  const ownLabels = (): number[] => (sqlite.prepare('SELECT id FROM labels WHERE owner = ? ORDER BY id').all(OWNER) as Array<{ id: number }>).map((r) => r.id)
  const links = (): number => (sqlite.prepare('SELECT COUNT(*) AS n FROM transaction_labels').get() as { n: number }).n

  it('adds the labels to the rows named, keeping the ones they have', async () => {
    const [first, second] = idsIn(firstMonth()) as [number, number]
    const [a, b] = ownLabels() as [number, number]
    sqlite.prepare('INSERT OR IGNORE INTO transaction_labels (transaction_id, label_id) VALUES (?, ?)').run(first, b)
    const had = labelsOf(first)

    const response = await label({ ids: [first, second], labelIds: [a] })

    expect(response.status).toBe(200)
    expect(labelsOf(first)).toEqual([...new Set([...had, a])].sort((x, y) => x - y))
    expect(labelsOf(second)).toContain(a)
    const body = (await response.json()) as { matched: number; added: number }
    expect(body.matched).toBe(2)
  })

  it('adds the labels to the rows a filter matches, with the same count and revision checks', async () => {
    const month = firstMonth()
    const looked = await look(`month=${month}`)
    const [a] = ownLabels() as [number]

    const response = await label({ filter: { month }, expectedCount: looked.count, expectedRevision: looked.revision, labelIds: [a] })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { matched: number; added: number }
    expect(body.matched).toBe(looked.count)
    for (const id of idsIn(month)) expect(labelsOf(id)).toContain(a)

    const stale = await label({ filter: { month }, expectedCount: looked.count, expectedRevision: looked.revision, labelIds: [a] })
    expect(stale.status).toBe(409)
    expect(await message(stale)).toBe(BULK_REVISION_MESSAGE)
  })

  it('is refused for a count that is not the one shown, and writes nothing', async () => {
    const month = firstMonth()
    const looked = await look(`month=${month}`)
    const [a] = ownLabels() as [number]
    const before = links()

    const response = await label({ filter: { month }, expectedCount: looked.count - 1, expectedRevision: looked.revision, labelIds: [a] })

    expect(response.status).toBe(409)
    expect(links()).toBe(before)
  })

  it('moves the revision, like every other write', async () => {
    const token = world.token()
    const [a] = ownLabels() as [number]

    await label({ ids: idsIn(firstMonth()).slice(0, 1), labelIds: [a] })

    expect(world.token()).not.toBe(token)
  })

  it('refuses another owner’s label and writes nothing', async () => {
    const foreign = (sqlite.prepare('SELECT id FROM labels WHERE owner = ?').get(OTHER) as { id: number }).id
    const before = links()

    const response = await label({ ids: idsIn(firstMonth()).slice(0, 2), labelIds: [foreign] })

    expect(response.status).toBe(400)
    expect(await message(response)).toBe('Invalid labelId')
    expect(links()).toBe(before)
  })

  it('does not label another owner’s rows, though their ids are in the list', async () => {
    const theirId = (sqlite.prepare('SELECT MIN(id) AS id FROM transactions WHERE owner = ?').get(OTHER) as { id: number }).id
    const [a] = ownLabels() as [number]

    const response = await label({ ids: [theirId], labelIds: [a] })

    expect(await response.json()).toEqual({ matched: 0, added: 0 })
    expect(labelsOf(theirId)).not.toContain(a)
  })

  it('refuses more links than the cap before reading a row', async () => {
    const ids = Array.from({ length: 500 }, (_, i) => i + 1)
    const labelIds = Array.from({ length: MAX_BULK_LABEL_LINKS / 500 + 1 }, (_, i) => i + 1)

    const response = await label({ ids, labelIds })

    expect(response.status).toBe(400)
    expect(await message(response)).toBe(bulkTooManyLinksMessage())
  })

  it.each([
    ['no labels', { ids: [1] }],
    ['no rows', { labelIds: [1] }],
    ['ids and a filter', { ids: [1], filter: {}, expectedCount: 1, expectedRevision: 'r', labelIds: [1] }],
  ])('answers 400 for %s', async (_name, body) => {
    expect((await label(body)).status).toBe(400)
  })
})
