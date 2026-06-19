import { describe, expect, it } from 'vitest'
import { requireUser } from './auth'
import type { Env } from './env'
import { HttpError } from './http'

function testEnv(overrides: Partial<Env> = {}): Env {
  return { DB: {} as D1Database, ...overrides }
}

describe('requireUser', () => {
  it('returns a normalised email from the Access header', () => {
    const request = new Request('https://expenses.test/api/expenses', {
      headers: { 'Cf-Access-Authenticated-User-Email': 'Roy@Example.com' },
    })
    expect(requireUser(request, testEnv())).toBe('roy@example.com')
  })

  it('rejects unauthenticated requests', () => {
    const request = new Request('https://expenses.test/api/expenses')
    expect(() => requireUser(request, testEnv())).toThrow(HttpError)
    try {
      requireUser(request, testEnv())
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError)
      expect((e as HttpError).status).toBe(401)
    }
  })
})
