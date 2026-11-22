import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPushConfig, fetchPushDevices, removePushDevice, savePushChoice, savePushDevice } from './pushApi'

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('push calls', () => {
  it('reads the key to subscribe with, which may be none', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ publicKey: null }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchPushConfig()).toBeNull()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/push-config')
  })

  it('reads the devices and the choice as the server sends them', async () => {
    const body = { devices: [{ id: 'd' }], settings: { mode: 'daily', timeZone: 'UTC' } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(body)))
    expect(await fetchPushDevices()).toEqual(body)
  })

  it('puts the subscription with the device’s name and zone, and returns the row’s id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ id: 'd-1' }))
    vi.stubGlobal('fetch', fetchMock)
    expect(
      await savePushDevice(
        { endpoint: 'https://web.push.apple.com/x', keys: { p256dh: 'k', auth: 'a' } },
        'iPhone',
        'Europe/Madrid',
      ),
    ).toBe('d-1')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/push-subscriptions')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({
      endpoint: 'https://web.push.apple.com/x',
      keys: { p256dh: 'k', auth: 'a' },
      label: 'iPhone',
      timeZone: 'Europe/Madrid',
    })
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
  })

  it('deletes a device by its id, and puts the choice as JSON', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(ok({ ok: true })))
    vi.stubGlobal('fetch', fetchMock)
    await removePushDevice('d-1')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/push-subscriptions/d-1')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' })
    await savePushChoice({ mode: 'weekly', timeZone: 'UTC' })
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'PUT', body: '{"mode":"weekly","timeZone":"UTC"}' })
  })
})
