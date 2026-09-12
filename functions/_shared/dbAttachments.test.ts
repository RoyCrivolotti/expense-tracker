import { describe, expect, it, vi } from 'vitest'
import {
  attachmentBytesUsed,
  createAttachment,
  deleteAttachment,
  findAttachmentSource,
  listAttachments,
  ownerAttachmentKeys,
  transactionExists,
} from './dbAttachments'
import type { Env } from './env'

/**
 * Same shape as the stub in dbFlags.test.ts: the integration tests run against
 * the in-memory repository, so the real SQL only gets exercised here.
 */
function stubEnv(opts: {
  first?: (sql: string, args: unknown[]) => unknown
  all?: (sql: string, args: unknown[]) => { results: unknown[] }
}) {
  const first = opts.first ?? (() => null)
  const all = opts.all ?? (() => ({ results: [] }))
  const calls: { sql: string; args: unknown[] }[] = []
  const prepare = vi.fn((sql: string) => ({
    bind: (...args: unknown[]) => {
      calls.push({ sql, args })
      return {
        first: vi.fn().mockImplementation(async () => first(sql, args)),
        all: vi.fn().mockImplementation(async () => all(sql, args)),
      }
    },
  }))
  return { env: { DB: { prepare } } as unknown as Env, calls }
}

const OWNER = 'owner@example.com'

const ROW = {
  id: 3,
  transaction_id: 7,
  object_key: 'owner@example.com/7/abc.jpg',
  thumb_key: 'owner@example.com/7/abc_thumb.jpg',
  content_type: 'image/jpeg',
  byte_size: 180_000,
  width: 1600,
  height: 1200,
  original_name: 'hotel.jpg',
  created_at: '2026-05-01T09:00:00Z',
}

describe('transactionExists', () => {
  it('is owner-scoped', async () => {
    const { env, calls } = stubEnv({ first: () => ({ ok: 1 }) })

    await expect(transactionExists(env, OWNER, 7)).resolves.toBe(true)
    expect(calls[0]?.args).toEqual([7, OWNER])
    expect(calls[0]?.sql).toContain('owner = ?')
  })

  it('is false for a transaction that is not this owner’s', async () => {
    const { env } = stubEnv({ first: () => null })

    await expect(transactionExists(env, OWNER, 7)).resolves.toBe(false)
  })
})

describe('listAttachments', () => {
  it('returns this transaction’s attachments, owner-scoped', async () => {
    const { env, calls } = stubEnv({ all: () => ({ results: [ROW] }) })

    const rows = await listAttachments(env, OWNER, 7)

    expect(rows).toEqual([
      {
        id: 3,
        transactionId: 7,
        contentType: 'image/jpeg',
        byteSize: 180_000,
        createdAt: '2026-05-01T09:00:00Z',
        hasThumb: true,
        width: 1600,
        height: 1200,
        originalName: 'hotel.jpg',
      },
    ])
    expect(calls[0]?.args).toEqual([OWNER, 7])
  })

  it('is empty when there are none', async () => {
    const { env } = stubEnv({})

    await expect(listAttachments(env, OWNER, 7)).resolves.toEqual([])
  })
})

describe('findAttachmentSource', () => {
  it('hands back only the storage-facing fields', async () => {
    const { env, calls } = stubEnv({ first: () => ROW })

    await expect(findAttachmentSource(env, OWNER, 3)).resolves.toEqual({
      objectKey: 'owner@example.com/7/abc.jpg',
      thumbKey: 'owner@example.com/7/abc_thumb.jpg',
      contentType: 'image/jpeg',
      originalName: 'hotel.jpg',
    })
    expect(calls[0]?.args).toEqual([3, OWNER])
  })

  it('returns null rather than throwing, so a foreign id looks like a missing one', async () => {
    const { env } = stubEnv({ first: () => null })

    await expect(findAttachmentSource(env, OWNER, 3)).resolves.toBeNull()
  })

  it('omits a thumb key that is not there', async () => {
    const { env } = stubEnv({ first: () => ({ ...ROW, thumb_key: null, original_name: null }) })

    await expect(findAttachmentSource(env, OWNER, 3)).resolves.toEqual({
      objectKey: 'owner@example.com/7/abc.jpg',
      contentType: 'image/jpeg',
    })
  })
})

describe('createAttachment', () => {
  it('binds every column, with nulls for the optional ones', async () => {
    const { env, calls } = stubEnv({ first: () => ROW })

    await createAttachment(env, OWNER, {
      transactionId: 7,
      objectKey: 'k',
      contentType: 'image/jpeg',
      byteSize: 100,
    })

    expect(calls[0]?.args).toEqual([OWNER, 7, 'k', null, 'image/jpeg', 100, null, null, null])
  })

  it('throws when D1 returns no row', async () => {
    const { env } = stubEnv({ first: () => null })

    await expect(
      createAttachment(env, OWNER, {
        transactionId: 7,
        objectKey: 'k',
        contentType: 'image/jpeg',
        byteSize: 1,
      }),
    ).rejects.toMatchObject({ status: 500 })
  })
})

describe('deleteAttachment', () => {
  it('deletes owner-scoped and hands back the keys to clean up', async () => {
    const { env, calls } = stubEnv({ first: () => ROW })

    await expect(deleteAttachment(env, OWNER, 3)).resolves.toEqual({
      objectKey: 'owner@example.com/7/abc.jpg',
      thumbKey: 'owner@example.com/7/abc_thumb.jpg',
    })
    expect(calls[0]?.sql).toContain('DELETE FROM transaction_attachments')
    expect(calls[0]?.args).toEqual([3, OWNER])
  })

  it('404s for an attachment that is not this owner’s', async () => {
    const { env } = stubEnv({ first: () => null })

    await expect(deleteAttachment(env, OWNER, 3)).rejects.toMatchObject({ status: 404 })
  })
})

describe('attachmentBytesUsed', () => {
  it('sums with a single aggregate rather than listing R2', async () => {
    const { env, calls } = stubEnv({ first: () => ({ total: 4_200 }) })

    await expect(attachmentBytesUsed(env, OWNER)).resolves.toBe(4_200)
    expect(calls[0]?.sql).toContain('SUM(byte_size)')
  })

  it('is zero for an owner with nothing stored', async () => {
    const { env } = stubEnv({ first: () => null })

    await expect(attachmentBytesUsed(env, OWNER)).resolves.toBe(0)
  })
})

describe('ownerAttachmentKeys', () => {
  it('returns both keys per row, for the revoke sweep', async () => {
    const { env } = stubEnv({
      all: () => ({
        results: [
          { object_key: 'a', thumb_key: 'a_t' },
          { object_key: 'b', thumb_key: null },
        ],
      }),
    })

    await expect(ownerAttachmentKeys(env, OWNER)).resolves.toEqual(['a', 'a_t', 'b'])
  })
})
