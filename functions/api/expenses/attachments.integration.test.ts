/**
 * @vitest-environment node
 *
 * Route tests, so jsdom buys nothing — and it actively breaks this file: jsdom's
 * Blob inside undici's FormData makes undici's multipart parser throw, so every
 * upload would fail with "Invalid form body" for a reason that has nothing to do
 * with the code under test.
 */
import { describe, expect, it, vi } from 'vitest'
import type { TransactionAttachment } from '../../../src/domain/types'
import type { Env } from '../../_shared/env'
import { createInMemoryAccessDb } from '../../_shared/testing/inMemoryAccessDb'
import { invokeExpenseApiRoute } from '../../_shared/testing/invokeExpenseApiRoute'
import { inMemoryExpenseRepository } from '../../../src/testing/inMemoryExpenseRepository'
import { onRequestPost as uploadAttachment } from './attachments/index'
import { onRequestGet as getAttachment, onRequestDelete as deleteAttachment } from './attachments/[id]'
import { onRequestDelete as deleteTransactionRoute } from './transactions/[id]'
import { onRequestDelete as bulkDeleteRoute } from './transactions/bulk'

const OWNER = 'owner@example.com'
const BASE = 'https://expenses.test/api/expenses'

const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0]

function jpegBytes(size = 64): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set(JPEG_HEAD)
  return bytes
}

/** Minimal in-memory R2 stand-in with the surface the adapter uses. */
function fakeBucket() {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>()
  return {
    objects,
    put: vi.fn(async (key: string, body: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) => {
      objects.set(key, {
        body: new Uint8Array(body),
        contentType: opts?.httpMetadata?.contentType ?? '',
      })
    }),
    get: vi.fn(async (key: string) => {
      const stored = objects.get(key)
      if (!stored) return null
      return {
        body: new ReadableStream({
          start(c) {
            c.enqueue(stored.body)
            c.close()
          },
        }),
        size: stored.body.length,
        httpEtag: `"${key}"`,
      }
    }),
    delete: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key)
    }),
  }
}

function seeded(withBucket = true) {
  const store = createInMemoryAccessDb()
  store.seedActiveUser(OWNER, { grantedBy: OWNER, groups: ['expenses'] })
  const repo = inMemoryExpenseRepository(
    {
      categories: [{ id: 1, name: 'Travel', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
      accounts: [{ id: 1, name: 'Debit', kind: 'debit', settlement: 'immediate', active: true }],
      transactions: [
        {
          id: 1,
          date: '2026-05-01',
          budgetMonth: '2026-05',
          description: 'Hotel',
          accountId: 1,
          categoryId: 1,
          type: 'expense',
          amountCents: 12_000,
          cancelled: false,
          status: 'posted',
        },
      ],
    },
    OWNER,
  )
  const bucket = fakeBucket()
  const env = {
    DB: store.db,
    OWNER_EMAIL: OWNER,
    ...(withBucket ? { RECEIPTS: bucket as unknown as R2Bucket } : {}),
  } as Env
  return { store, repo, bucket, env }
}

function upload(bytes: Uint8Array, opts: { name?: string; thumb?: Uint8Array; txnId?: number } = {}) {
  const form = new FormData()
  form.set('transactionId', String(opts.txnId ?? 1))
  form.set('file', new Blob([bytes], { type: 'image/jpeg' }), opts.name ?? 'hotel.jpg')
  if (opts.thumb) form.set('thumb', new Blob([opts.thumb], { type: 'image/jpeg' }), 'thumb.jpg')
  return form
}

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

describe('attachments API', () => {
  it('stores the bytes and returns the metadata', async () => {
    const { repo, bucket, env } = seeded()
    const response = await invokeExpenseApiRoute({
      handler: uploadAttachment,
      repo,
      env,
      url: `${BASE}/attachments`,
      method: 'POST',
      rawBody: upload(jpegBytes(), { thumb: jpegBytes(32) }),
    })

    expect(response.status).toBe(201)
    const attachment = await body<TransactionAttachment>(response)
    expect(attachment).toMatchObject({
      transactionId: 1,
      contentType: 'image/jpeg',
      // File plus thumbnail: byteSize is what this attachment occupies, so the
      // quota reflects real storage rather than only the part we sniffed first.
      byteSize: 96,
      originalName: 'hotel.jpg',
      hasThumb: true,
    })
    expect(bucket.put).toHaveBeenCalledTimes(2)
  })

  it('keys objects by owner and content hash, never by the filename', async () => {
    // A key built from user input is the classic traversal hole; this asserts
    // the scheme cannot carry one.
    const { repo, bucket, env } = seeded()
    await invokeExpenseApiRoute({
      handler: uploadAttachment,
      repo,
      env,
      url: `${BASE}/attachments`,
      method: 'POST',
      rawBody: upload(jpegBytes(), { name: '../../etc/passwd' }),
    })

    const key = [...bucket.objects.keys()][0]!
    expect(key).toMatch(new RegExp(`^${OWNER}/1/[0-9a-f]{64}\\.jpg$`))
    expect(key).not.toContain('..')
    expect(key).not.toContain('passwd')
  })

  it('records the type it sniffed, not the one the client declared', async () => {
    const { repo, env } = seeded()
    const form = new FormData()
    form.set('transactionId', '1')
    // Claims PNG, is actually a JPEG.
    form.set('file', new Blob([jpegBytes()], { type: 'image/png' }), 'lie.png')

    const response = await invokeExpenseApiRoute({
      handler: uploadAttachment,
      repo,
      env,
      url: `${BASE}/attachments`,
      method: 'POST',
      rawBody: form,
    })

    expect((await body<TransactionAttachment>(response)).contentType).toBe('image/jpeg')
  })

  it('rejects an SVG however it is labelled', async () => {
    const { repo, env, bucket } = seeded()
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')
    const form = new FormData()
    form.set('transactionId', '1')
    form.set('file', new Blob([svg], { type: 'image/jpeg' }), 'evil.jpg')

    const response = await invokeExpenseApiRoute({
      handler: uploadAttachment,
      repo,
      env,
      url: `${BASE}/attachments`,
      method: 'POST',
      rawBody: form,
    })

    expect(response.status).toBe(400)
    expect((await body<{ error: string }>(response)).error).toMatch(/JPEG, PNG, WebP or PDF/)
    expect(bucket.put).not.toHaveBeenCalled()
  })

  it('refuses to attach to a transaction that is not yours', async () => {
    const { repo, env, bucket } = seeded()
    const response = await invokeExpenseApiRoute({
      handler: uploadAttachment,
      repo,
      env,
      url: `${BASE}/attachments`,
      method: 'POST',
      rawBody: upload(jpegBytes(), { txnId: 999 }),
    })

    expect(response.status).toBe(400)
    expect(await body<{ error: string }>(response)).toEqual({ error: 'Invalid transactionId' })
    expect(bucket.put).not.toHaveBeenCalled()
  })

  it('enforces the per-transaction cap', async () => {
    const { repo, env } = seeded()
    for (let i = 0; i < 4; i++) {
      await invokeExpenseApiRoute({
        handler: uploadAttachment,
        repo,
        env,
        url: `${BASE}/attachments`,
        method: 'POST',
        rawBody: upload(jpegBytes(64 + i)),
      })
    }
    const response = await invokeExpenseApiRoute({
      handler: uploadAttachment,
      repo,
      env,
      url: `${BASE}/attachments`,
      method: 'POST',
      rawBody: upload(jpegBytes(100)),
    })

    expect(response.status).toBe(400)
    expect((await body<{ error: string }>(response)).error).toMatch(/can hold 4 receipts/)
  })

  it('serves the bytes with the lock-down headers', async () => {
    const { repo, env } = seeded()
    const created = await body<TransactionAttachment>(
      await invokeExpenseApiRoute({
        handler: uploadAttachment,
        repo,
        env,
        url: `${BASE}/attachments`,
        method: 'POST',
        rawBody: upload(jpegBytes()),
      }),
    )

    const response = await invokeExpenseApiRoute({
      handler: getAttachment,
      repo,
      env,
      url: `${BASE}/attachments/${created.id}`,
      params: { id: String(created.id) },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin')
  })

  it('404s for an attachment belonging to someone else, without touching R2', async () => {
    const { repo, env, bucket } = seeded()
    const response = await invokeExpenseApiRoute({
      handler: getAttachment,
      repo,
      env,
      url: `${BASE}/attachments/4242`,
      params: { id: '4242' },
    })

    expect(response.status).toBe(404)
    expect(bucket.get).not.toHaveBeenCalled()
  })

  it('answers 304 when the client already has the bytes', async () => {
    const { repo, env } = seeded()
    const created = await body<TransactionAttachment>(
      await invokeExpenseApiRoute({
        handler: uploadAttachment,
        repo,
        env,
        url: `${BASE}/attachments`,
        method: 'POST',
        rawBody: upload(jpegBytes()),
      }),
    )
    const first = await invokeExpenseApiRoute({
      handler: getAttachment,
      repo,
      env,
      url: `${BASE}/attachments/${created.id}`,
      params: { id: String(created.id) },
    })
    const etag = first.headers.get('etag')!

    const request = await invokeExpenseApiRoute({
      handler: getAttachment,
      repo,
      env,
      url: `${BASE}/attachments/${created.id}`,
      params: { id: String(created.id) },
      extraHeaders: { 'if-none-match': etag },
    })

    expect(request.status).toBe(304)
  })

  it('deletes the row and both objects', async () => {
    const { repo, env, bucket } = seeded()
    const created = await body<TransactionAttachment>(
      await invokeExpenseApiRoute({
        handler: uploadAttachment,
        repo,
        env,
        url: `${BASE}/attachments`,
        method: 'POST',
        rawBody: upload(jpegBytes(), { thumb: jpegBytes(32) }),
      }),
    )
    expect(bucket.objects.size).toBe(2)

    const response = await invokeExpenseApiRoute({
      handler: deleteAttachment,
      repo,
      env,
      url: `${BASE}/attachments/${created.id}`,
      method: 'DELETE',
      params: { id: String(created.id) },
    })

    expect(response.status).toBe(200)
    expect(bucket.objects.size).toBe(0)
    expect(await repo.listAttachments(OWNER, 1)).toEqual([])
  })

  it('degrades to 503 when the bucket is not bound, rather than crashing', async () => {
    const { repo, env } = seeded(false)
    const response = await invokeExpenseApiRoute({
      handler: uploadAttachment,
      repo,
      env,
      url: `${BASE}/attachments`,
      method: 'POST',
      rawBody: upload(jpegBytes()),
    })

    expect(response.status).toBe(503)
    expect((await body<{ error: string }>(response)).error).toMatch(/not configured/)
  })

  it('401s without the Cloudflare Access header', async () => {
    const { repo, env } = seeded()
    const response = await invokeExpenseApiRoute({
      handler: uploadAttachment,
      repo,
      env,
      url: `${BASE}/attachments`,
      method: 'POST',
      email: false,
      rawBody: upload(jpegBytes()),
    })

    expect(response.status).toBe(401)
  })

  it('deleting a transaction takes its receipts — rows and bytes — with it', async () => {
    // Otherwise the bytes keep consuming the 2 GB quota with no UI left to
    // reach them: the only delete affordance lives on the transaction.
    const { repo, bucket, env } = seeded()
    await invokeExpenseApiRoute({
      handler: uploadAttachment,
      repo,
      env,
      url: `${BASE}/attachments`,
      method: 'POST',
      rawBody: upload(jpegBytes(), { thumb: jpegBytes(32) }),
    })
    expect(bucket.objects.size).toBe(2)

    const response = await invokeExpenseApiRoute({
      handler: deleteTransactionRoute,
      repo,
      env,
      url: `${BASE}/transactions/1`,
      method: 'DELETE',
      params: { id: '1' },
    })

    expect(response.status).toBe(200)
    expect(bucket.objects.size).toBe(0)
    expect(await repo.listAttachments(OWNER, 1)).toEqual([])
    expect(await repo.attachmentBytesUsed(OWNER)).toBe(0)
  })

  it('does the same for a bulk delete', async () => {
    const { repo, bucket, env } = seeded()
    await invokeExpenseApiRoute({
      handler: uploadAttachment,
      repo,
      env,
      url: `${BASE}/attachments`,
      method: 'POST',
      rawBody: upload(jpegBytes()),
    })
    expect(bucket.objects.size).toBe(1)

    await invokeExpenseApiRoute({
      handler: bulkDeleteRoute,
      repo,
      env,
      url: `${BASE}/transactions/bulk`,
      method: 'DELETE',
      body: { ids: [1] },
    })

    expect(bucket.objects.size).toBe(0)
    expect(await repo.attachmentBytesUsed(OWNER)).toBe(0)
  })

  it('still deletes the transaction when the receipts bucket is unbound', async () => {
    // The rows cascade inside D1 regardless; only the byte sweep is skipped.
    const { repo, env } = seeded(false)
    const response = await invokeExpenseApiRoute({
      handler: deleteTransactionRoute,
      repo,
      env,
      url: `${BASE}/transactions/1`,
      method: 'DELETE',
      params: { id: '1' },
    })

    expect(response.status).toBe(200)
  })

  it('sniffs the thumbnail too, and counts its bytes against the quota', async () => {
    // The thumb is client-supplied like the file. Unchecked, a raw API call
    // could store an arbitrarily large unsniffed object for free.
    const { repo, env } = seeded()
    const form = new FormData()
    form.set('transactionId', '1')
    form.set('file', new Blob([jpegBytes(64)], { type: 'image/jpeg' }), 'hotel.jpg')
    form.set('thumb', new Blob([jpegBytes(16)], { type: 'image/jpeg' }), 'thumb.jpg')

    const created = await body<TransactionAttachment>(
      await invokeExpenseApiRoute({
        handler: uploadAttachment,
        repo,
        env,
        url: `${BASE}/attachments`,
        method: 'POST',
        rawBody: form,
      }),
    )

    expect(created.byteSize).toBe(80)
    expect(await repo.attachmentBytesUsed(OWNER)).toBe(80)
  })

  it('refuses a thumbnail that is not a raster image', async () => {
    const { repo, env, bucket } = seeded()
    const form = new FormData()
    form.set('transactionId', '1')
    form.set('file', new Blob([jpegBytes()], { type: 'image/jpeg' }), 'hotel.jpg')
    form.set('thumb', new Blob([new TextEncoder().encode('<svg/>')], { type: 'image/jpeg' }), 't.jpg')

    const response = await invokeExpenseApiRoute({
      handler: uploadAttachment,
      repo,
      env,
      url: `${BASE}/attachments`,
      method: 'POST',
      rawBody: form,
    })

    expect(response.status).toBe(400)
    expect(bucket.put).not.toHaveBeenCalled()
  })
})
