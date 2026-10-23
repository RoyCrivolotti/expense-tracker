import { describe, expect, it } from 'vitest'
import { HttpError } from '../http'
import { cloudflareAccessAuth } from './cloudflareAccessAuth'

describe('cloudflareAccessAuth', () => {
  it('returns a normalised email from the Access header', () => {
    const request = new Request('https://expenses.test/api/expenses', {
      headers: { 'Cf-Access-Authenticated-User-Email': 'Roy@Example.com' },
    })
    expect(cloudflareAccessAuth.resolveUser(request, {})).toBe('roy@example.com')
  })

  it('rejects unauthenticated requests', () => {
    const request = new Request('https://expenses.test/api/expenses')
    expect(() => cloudflareAccessAuth.resolveUser(request, {})).toThrow(HttpError)
    try {
      cloudflareAccessAuth.resolveUser(request, {})
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError)
      expect((e as HttpError).status).toBe(401)
    }
  })
})
