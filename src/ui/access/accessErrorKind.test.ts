import { describe, expect, it } from 'vitest'
import { classifyAccessError } from './accessErrorKind'

describe('classifyAccessError', () => {
  it('treats service worker no-response as connection', () => {
    const msg =
      'FetchEvent.respondWith received an error: NoResponseError: no-response :: [{"url":"https://expenses.crivolotti.com/api/access/status","status":0}]'
    expect(classifyAccessError(msg)).toBe('connection')
  })

  it('treats 401 as auth', () => {
    expect(classifyAccessError('Not authenticated')).toBe('auth')
    expect(classifyAccessError('Request failed (401)')).toBe('auth')
  })
})
