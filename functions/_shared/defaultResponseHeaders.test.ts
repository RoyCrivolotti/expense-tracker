// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { withDefaultResponseHeaders } from './defaultResponseHeaders'

describe('withDefaultResponseHeaders', () => {
  it('adds no-store and nosniff to a response that sets neither', () => {
    const out = withDefaultResponseHeaders(new Response('{}', { status: 201 }))

    expect(out.headers.get('cache-control')).toBe('private, no-store')
    expect(out.headers.get('x-content-type-options')).toBe('nosniff')
    expect(out.status).toBe(201)
  })

  it('keeps a Cache-Control the route set, and adds only what is missing', () => {
    const out = withDefaultResponseHeaders(new Response('{}', { headers: { 'cache-control': 'private, no-cache', etag: 'W/"x"' } }))

    expect(out.headers.get('cache-control')).toBe('private, no-cache')
    expect(out.headers.get('etag')).toBe('W/"x"')
    expect(out.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('returns the same response when it has both already', () => {
    const response = new Response('{}', { headers: { 'cache-control': 'private, max-age=60', 'x-content-type-options': 'nosniff' } })

    expect(withDefaultResponseHeaders(response)).toBe(response)
  })

  it('keeps a 304 empty and keeps the body of a streamed answer unread', async () => {
    const notModified = withDefaultResponseHeaders(new Response(null, { status: 304, headers: { etag: 'W/"x"' } }))
    const streamed = withDefaultResponseHeaders(new Response('bytes', { headers: { 'content-type': 'image/png' } }))

    expect(notModified.status).toBe(304)
    expect(await notModified.text()).toBe('')
    expect(await streamed.text()).toBe('bytes')
    expect(streamed.headers.get('content-type')).toBe('image/png')
  })

  it('works on a response whose headers are immutable', () => {
    const immutable = Response.redirect('https://expenses.test/x', 302)

    expect(withDefaultResponseHeaders(immutable).headers.get('cache-control')).toBe('private, no-store')
  })
})
