// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { assertWriteIsSameSiteJson } from './requestHygiene'

const PATH = '/api/expenses/transactions'

function request(method: string, init: { type?: string; body?: BodyInit | null; site?: string } = {}): Request {
  const headers = new Headers()
  if (init.type) headers.set('content-type', init.type)
  if (init.site) headers.set('sec-fetch-site', init.site)
  return new Request(`https://expenses.test${PATH}`, { method, headers, ...(init.body != null ? { body: init.body } : {}) })
}

const refusal = (r: Request, path = PATH): { status: number } | null => {
  try {
    assertWriteIsSameSiteJson(r, path)
    return null
  } catch (error) {
    return error as { status: number }
  }
}

describe('a write that carries a body', () => {
  it.each(['application/json', 'application/json; charset=utf-8', 'Application/JSON', ' application/json ;charset=UTF-8'])(
    'is let through as %s',
    (type) => {
      expect(refusal(request('POST', { type, body: '{}' }))).toBeNull()
    },
  )

  it.each(['text/plain', 'text/plain;charset=UTF-8', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'application/jsonx', 'application/vnd.api+json', ''])(
    'is a 415 as %j, the types a page on another site can send without a preflight and the ones that are not JSON',
    (type) => {
      expect(refusal(request('POST', { type, body: '{}' }))?.status).toBe(415)
    },
  )

  it('is a 415 with no content type at all', () => {
    expect(refusal(request('POST', { body: '{}' }))?.status).toBe(415)
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('is checked for %s', (method) => {
    expect(refusal(request(method, { type: 'text/plain', body: '{}' }))?.status).toBe(415)
    expect(refusal(request(method, { type: 'application/json', body: '{}' }))).toBeNull()
  })

  it('is let through as multipart on the receipt upload, and only there', () => {
    const upload = request('POST', { type: 'multipart/form-data; boundary=x', body: '--x--' })

    expect(refusal(upload, '/api/expenses/attachments')).toBeNull()
    expect(refusal(upload, '/api/expenses/attachments/7')?.status).toBe(415)
    expect(refusal(upload, '/api/expenses/transactions')?.status).toBe(415)
  })
})

describe('a write with no body', () => {
  it.each(['POST', 'DELETE', 'PUT', 'PATCH'])('needs no content type: %s', (method) => {
    expect(refusal(request(method))).toBeNull()
  })
})

describe('Sec-Fetch-Site on a write', () => {
  it('refuses cross-site with a 403, whatever the body says', () => {
    expect(refusal(request('POST', { type: 'application/json', body: '{}', site: 'cross-site' }))?.status).toBe(403)
    expect(refusal(request('DELETE', { site: 'cross-site' }))?.status).toBe(403)
    expect(refusal(request('POST', { type: 'text/plain', body: '{}', site: 'cross-site' }))?.status).toBe(403)
  })

  it.each(['same-origin', 'same-site', 'none'])('lets %s through', (site) => {
    expect(refusal(request('POST', { type: 'application/json', body: '{}', site }))).toBeNull()
  })

  it('is not asked of a client that does not send it', () => {
    expect(refusal(request('POST', { type: 'application/json', body: '{}' }))).toBeNull()
  })
})

describe('a read', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])('is never refused: %s', (method) => {
    expect(refusal(request(method, { site: 'cross-site' }))).toBeNull()
  })
})
