// @vitest-environment node
/**
 * GET /attachments is read by the Settings data screen and by every screen that lists the receipts of a few
 * transactions, and each read costs a row per receipt the owner has. It is cached against the revision as the ledger
 * parts are: a request that holds the current tag is answered after two rows are read, and any write moves the tag.
 */
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { OTHER, createExpenseWorld, pinClock, type World } from '../../_shared/testing/expenseWorld'
import { seedLedger, uploadForm, type SeededIds } from '../../_shared/testing/seedLedger'
import { onRequestDelete as deleteAttachment } from './attachments/[id]'
import { onRequestGet, onRequestPost } from './attachments/index'
import { onRequestDelete as deleteTransaction } from './transactions/[id]'

let world: World
let sqlite: DatabaseSync
let ids: SeededIds

beforeEach(async () => {
  pinClock('2026-10-15')
  sqlite = migratedDatabase()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  ids = await seedLedger(world)
})

afterEach(() => {
  vi.useRealTimers()
})

const list = (headers?: Record<string, string>, path = '/attachments', email?: string) =>
  world.call(onRequestGet, { path, ...(headers ? { headers } : {}), ...(email ? { email } : {}) })

const tagOf = (response: Response): string => response.headers.get('etag')!

describe('GET /attachments', () => {
  it('sends a weak tag and asks the browser to check before it reuses the list', async () => {
    const response = await list()

    expect(response.status).toBe(200)
    expect(tagOf(response)).toMatch(/^W\/"[0-9a-f]+-2026-10-attachments\d+"$/)
    expect(response.headers.get('cache-control')).toBe('private, no-cache')
    expect(await response.json()).toHaveLength(1)
  })

  it('answers the tag it sent with a 304, an empty body and the same headers', async () => {
    const first = await list()

    const again = await list({ 'if-none-match': tagOf(first) })

    expect(again.status).toBe(304)
    expect(await again.text()).toBe('')
    expect(tagOf(again)).toBe(tagOf(first))
    expect(again.headers.get('cache-control')).toBe('private, no-cache')
  })

  it('reads no receipt rows for a 304', async () => {
    const tag = tagOf(await list())
    world.clearLog()

    await list({ 'if-none-match': tag })

    expect(world.log.filter((sql) => sql.includes('transaction_attachments'))).toEqual([])
  })

  it('has a tag per transaction, and the tag of one list never answers for the other', async () => {
    const t = ids.transactions[0]!
    const all = tagOf(await list())
    const one = await list(undefined, `/attachments?transactionId=${t}`)

    expect(tagOf(one)).not.toBe(all)
    expect((await list({ 'if-none-match': all }, `/attachments?transactionId=${t}`)).status).toBe(200)
    expect((await list({ 'if-none-match': tagOf(one) }, `/attachments?transactionId=${t}`)).status).toBe(304)
    expect((await list({ 'if-none-match': tagOf(one) })).status).toBe(200)
    expect(tagOf(await list(undefined, `/attachments?transactionId=${ids.transactions[1]}`))).not.toBe(tagOf(one))
  })

  it('is a 200 with a new list after a receipt is added', async () => {
    const tag = tagOf(await list())

    expect((await world.call(onRequestPost, { method: 'POST', path: '/attachments', rawBody: uploadForm(ids.transactions[1]!) })).status).toBe(201)

    const after = await list({ 'if-none-match': tag })
    expect(after.status).toBe(200)
    expect(await after.json()).toHaveLength(2)
  })

  it('is a 200 with a new list after a receipt is removed', async () => {
    const tag = tagOf(await list())

    await world.call(deleteAttachment, { method: 'DELETE', path: `/attachments/${ids.attachment}`, params: { id: String(ids.attachment) } })

    const after = await list({ 'if-none-match': tag })
    expect(after.status).toBe(200)
    expect(await after.json()).toEqual([])
  })

  it('is a 200 with a new list after the transaction that held the receipt is deleted', async () => {
    const tag = tagOf(await list())
    const t = ids.transactions[0]!

    await world.call(deleteTransaction, { method: 'DELETE', path: `/transactions/${t}`, params: { id: String(t) } })

    const after = await list({ 'if-none-match': tag })
    expect(after.status).toBe(200)
    expect(await after.json()).toEqual([])
  })

  it('never lets a tag, or a wildcard, answer for another owner', async () => {
    const tag = tagOf(await list())

    const other = await list({ 'if-none-match': tag }, '/attachments', OTHER)

    expect(other.status).toBe(200)
    expect(await other.json()).toEqual([])
    expect((await list({ 'if-none-match': '*' })).status).toBe(200)
  })

  it('still refuses a bad transactionId and an unknown parameter before reading anything', async () => {
    expect((await list(undefined, '/attachments?transactionId=0')).status).toBe(400)
    expect((await list(undefined, '/attachments?transactionId=x')).status).toBe(400)
    expect((await list(undefined, '/attachments?other=1')).status).toBe(400)
  })
})
