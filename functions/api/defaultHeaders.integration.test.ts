// @vitest-environment node
/**
 * Every API answer carries `Cache-Control` and `nosniff` unless its route chose its own Cache-Control, over the real
 * handlers and SQL: an answer is one person's data, so what no route asked to keep is not kept.
 */
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migratedDatabase, newStats, sqliteD1 } from '../../src/testing/sqliteD1'
import { createExpenseWorld, pinClock, type World } from '../_shared/testing/expenseWorld'
import { seedLedger, type SeededIds } from '../_shared/testing/seedLedger'
import { onRequestGet as getAttachment } from './expenses/attachments/[id]'
import { onRequestGet as listAttachments } from './expenses/attachments/index'
import { onRequestGet as getDataset } from './expenses/index'
import { onRequestGet as getExport } from './expenses/export'
import { onRequestGet as getOne } from './expenses/transactions/[id]'

let world: World
let ids: SeededIds

beforeEach(async () => {
  pinClock('2026-10-15')
  const sqlite: DatabaseSync = migratedDatabase()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  ids = await seedLedger(world)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the headers of an answer', () => {
  const t = () => String(ids.transactions[0])

  it('are no-store and nosniff when the route sets no Cache-Control: one row', async () => {
    const response = await world.call(getOne, { path: `/transactions/${t()}`, params: { id: t() } })

    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('are no-store on an error, a 404 and a 401 included', async () => {
    const missing = await world.call(getOne, { path: '/transactions/999999', params: { id: '999999' } })
    const anonymous = await world.call(getOne, { path: `/transactions/${t()}`, params: { id: t() }, email: '' })

    expect(missing.status).toBe(404)
    expect(missing.headers.get('cache-control')).toBe('private, no-store')
    expect(anonymous.status).toBe(401)
    expect(anonymous.headers.get('cache-control')).toBe('private, no-store')
    expect(anonymous.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('keep the Cache-Control a route chose: the dataset and the receipt list are revalidated, the export is not stored', async () => {
    const dataset = await world.call(getDataset, {})
    const list = await world.call(listAttachments, { path: '/attachments' })
    const exported = await world.call(getExport, { path: '/export?table=transactions' })

    expect(dataset.headers.get('cache-control')).toBe('private, no-cache')
    expect(list.headers.get('cache-control')).toBe('private, no-cache')
    expect(exported.headers.get('cache-control')).toBe('private, no-store')
  })

  it('keep a receipt cacheable by the browser, and nosniff', async () => {
    const response = await world.call(getAttachment, { path: `/attachments/${ids.attachment}`, params: { id: String(ids.attachment) } })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toMatch(/max-age=31536000/)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-type')).toMatch(/^image\/jpeg/)
  })

  it('keep a 304 empty, with its tag and Cache-Control', async () => {
    const first = await world.call(getDataset, {})

    const again = await world.call(getDataset, { headers: { 'if-none-match': first.headers.get('etag')! } })

    expect(again.status).toBe(304)
    expect(await again.text()).toBe('')
    expect(again.headers.get('cache-control')).toBe('private, no-cache')
    expect(again.headers.get('etag')).toBe(first.headers.get('etag'))
  })
})
