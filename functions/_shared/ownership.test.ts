import { describe, expect, it, vi } from 'vitest'
import { assertOwnedAccount, assertOwnedCategory, assertOwnedTransaction } from './ownership'
import { HttpError } from './http'
import type { Env } from './env'

function envWith(first: unknown): Env {
  return {
    DB: {
      prepare: () => ({
        bind: () => ({
          first: vi.fn().mockResolvedValue(first),
        }),
      }),
    },
  } as unknown as Env
}

describe('ownership guards', () => {
  it('assertOwnedAccount passes when row exists', async () => {
    await expect(assertOwnedAccount(envWith({ ok: 1 }), 'a@b.com', 3)).resolves.toBeUndefined()
  })

  it('assertOwnedAccount rejects foreign ids', async () => {
    await expect(assertOwnedAccount(envWith(null), 'a@b.com', 3)).rejects.toBeInstanceOf(HttpError)
  })

  it('assertOwnedCategory rejects foreign ids', async () => {
    await expect(assertOwnedCategory(envWith(undefined), 'a@b.com', 9)).rejects.toBeInstanceOf(
      HttpError,
    )
  })

  it('assertOwnedTransaction passes when row exists', async () => {
    await expect(
      assertOwnedTransaction(envWith({ ok: 1 }), 'a@b.com', 7),
    ).resolves.toBeUndefined()
  })

  it('assertOwnedTransaction rejects a foreign or missing id', async () => {
    await expect(assertOwnedTransaction(envWith(null), 'a@b.com', 7)).rejects.toMatchObject({
      status: 400,
      message: 'Invalid settledBy',
    })
  })
})
