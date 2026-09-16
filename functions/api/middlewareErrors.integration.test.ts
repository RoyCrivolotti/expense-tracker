import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../_shared/env'
import { HttpError } from '../_shared/http'
import { createInMemoryAccessDb } from '../_shared/testing/inMemoryAccessDb'
import { invokeApiRoute } from '../_shared/testing/invokeApiRoute'
import { ValidationError } from '../domain/application/validationError'

const OWNER = 'owner@example.com'

/**
 * A route that throws instead of catching, which is what half the routes do: their
 * errors reach the middleware and nothing else decides the status.
 */
function throwing(error: unknown): PagesFunction<Env, string, never> {
  return () => {
    throw error
  }
}

async function call(error: unknown): Promise<{ status: number; body: { error: string } }> {
  const store = createInMemoryAccessDb()
  store.seedActiveUser(OWNER, { groups: ['expenses'] })
  const response = await invokeApiRoute({
    handler: throwing(error) as never,
    env: { DB: store.db, OWNER_EMAIL: OWNER },
    url: 'https://expenses.test/api/expenses/anything',
  })
  return { status: response.status, body: (await response.json()) as { error: string } }
}

describe('the /api middleware, for a route that does not catch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('answers a validation failure with 400, as a route that catches would', async () => {
    // It answered 500 here and 400 from the routes that call mapAppError, so the same
    // bad date got two different statuses depending only on which route it hit.
    const { status, body } = await call(new ValidationError('date must be YYYY-MM-DD'))

    expect(status).toBe(400)
    expect(body.error).toBe('date must be YYYY-MM-DD')
  })

  it('keeps an explicit status', async () => {
    const { status, body } = await call(new HttpError(409, 'Already settled'))

    expect(status).toBe(409)
    expect(body.error).toBe('Already settled')
  })

  it('answers anything else with 500 and without the driver text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { status, body } = await call(new Error('D1_ERROR: no such table: transactions'))

    expect(status).toBe(500)
    expect(body.error).not.toContain('D1_ERROR')
    expect(body.error).not.toContain('transactions')
  })
})
