// @vitest-environment node
/**
 * The generic Shortcut file route through the real middleware: the same bytes for everyone signed in, as a download,
 * from the receipts bucket under one fixed key. The bytes here are a few invented ones, never a real file.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { OTHER, OWNER, createExpenseWorld, type World } from '../../_shared/testing/expenseWorld'
import { invokeExpenseApiRoute } from '../../_shared/testing/invokeExpenseApiRoute'
import { createD1ExpenseRepository } from '../../_shared/adapters/d1ExpenseRepository'
import { onRequestGet as download } from './index'

let world: World
const KEY = 'shortcuts/capture.shortcut'
const FAKE = new Uint8Array([0x62, 0x70, 0x6c, 0x69, 0x73, 0x74, 0x30, 0x30])

beforeEach(() => {
  const sqlite = migratedDatabase()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

const get = (o: { email?: string | false; bound?: boolean } = {}) =>
  invokeExpenseApiRoute({
    handler: download,
    repo: createD1ExpenseRepository(world.env),
    env: o.bound === false ? { ...world.env, RECEIPTS: undefined } : world.env,
    url: 'https://expenses.test/api/capture-shortcut',
    method: 'GET',
    email: o.email === undefined ? OWNER : o.email,
  })

describe('GET /api/capture-shortcut', () => {
  it('answers 404 when nothing has been uploaded, and when the bucket is not bound', async () => {
    expect((await get()).status).toBe(404)
    expect((await get({ bound: false })).status).toBe(404)
  })

  it('serves the uploaded bytes as a download with the file name, no sniffing and no shared cache', async () => {
    await world.env.RECEIPTS!.put(KEY, FAKE)
    const response = await get()

    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(FAKE)
    expect(response.headers.get('content-type')).toBe('application/octet-stream')
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="Expense capture.shortcut"')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('content-length')).toBe(String(FAKE.length))
  })

  it('serves the same bytes to every signed-in person', async () => {
    await world.env.RECEIPTS!.put(KEY, FAKE)

    expect(new Uint8Array(await (await get({ email: OTHER })).arrayBuffer())).toEqual(FAKE)
  })

  it('refuses a file over the size cap, as if it were not there', async () => {
    await world.env.RECEIPTS!.put(KEY, new Uint8Array(256 * 1024 + 1))
    expect((await get()).status).toBe(404)
    await world.env.RECEIPTS!.put(KEY, new Uint8Array(256 * 1024))
    expect((await get()).status).toBe(200)
  })

  it('answers 404 when the object disappears between the size check and the read', async () => {
    await world.env.RECEIPTS!.put(KEY, FAKE)
    vi.spyOn(world.env.RECEIPTS!, 'get').mockResolvedValue(null)

    expect((await get()).status).toBe(404)
  })

  it('sends the length of the object it streams when the file is replaced after the check', async () => {
    await world.env.RECEIPTS!.put(KEY, FAKE)
    const bucket = world.env.RECEIPTS!
    const real = bucket.get.bind(bucket)
    vi.spyOn(bucket, 'get').mockImplementation(async (key: string) => {
      await bucket.put(KEY, new Uint8Array(20))
      return real(key)
    })
    const response = await get()
    expect(response.headers.get('content-length')).toBe('20')
    expect((await response.arrayBuffer()).byteLength).toBe(20)
  })

  it('answers 404 when the file grew past the cap between the check and the read', async () => {
    await world.env.RECEIPTS!.put(KEY, FAKE)
    const bucket = world.env.RECEIPTS!
    const real = bucket.get.bind(bucket)
    vi.spyOn(bucket, 'get').mockImplementation(async (key: string) => {
      await bucket.put(KEY, new Uint8Array(256 * 1024 + 1))
      return real(key)
    })
    expect((await get()).status).toBe(404)
  })

  it('answers the fixed 500 when the bucket cannot be read, never the error text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await world.env.RECEIPTS!.put(KEY, FAKE)
    vi.spyOn(world.env.RECEIPTS!, 'get').mockRejectedValue(new Error('bucket secret-name unavailable'))
    const response = await get()
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('secret-name')
  })

  it('is refused without a sign-in, and never offers a receipt under another key', async () => {
    await world.env.RECEIPTS!.put(KEY, FAKE)
    expect((await get({ email: false })).status).toBe(401)
    await world.env.RECEIPTS!.put('receipts/not-the-shortcut', FAKE)
    const spy = vi.spyOn(world.env.RECEIPTS!, 'get')
    await get()
    expect(spy).toHaveBeenCalledWith(KEY)
  })
})
