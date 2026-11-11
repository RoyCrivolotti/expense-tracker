import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCaptureKey, fetchCaptureKeys, revokeCaptureKey } from './captureKeysApi'

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('capture key calls', () => {
  it('lists keys from the keys property', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ keys: [{ keyId: 'a' }] }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await fetchCaptureKeys()).toEqual([{ keyId: 'a' }])
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/capture-keys')
  })

  it('posts the label as JSON and returns the key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ keyId: 'a', key: 'k' }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await createCaptureKey('My iPhone')).toEqual({ keyId: 'a', key: 'k' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/capture-keys')
    expect(init).toMatchObject({ method: 'POST', body: '{"label":"My iPhone"}' })
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
  })

  it('deletes the key by its id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await revokeCaptureKey('0123456789abcdef')

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/capture-keys/0123456789abcdef')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' })
  })
})
