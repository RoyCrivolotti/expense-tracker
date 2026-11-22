import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchMutedWordings, unmuteWording } from './captureTemplatesApi'

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
afterEach(() => vi.unstubAllGlobals())

function stub(body: unknown) {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(ok(body)))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const MUTED = {
  templateId: '0b6f1c1e-2d1b-4c55-9a0e-7d7e2f9b1a10',
  source: 'newbank',
  skeleton: 'offer <N> <C>',
  seen: 4,
  dismissals: 3,
  ignoredAt: '2026-11-10T09:00:00.000Z',
}

describe('muted wording calls', () => {
  it('reads the muted list', async () => {
    const fetchMock = stub({ templates: [MUTED] })

    expect(await fetchMutedWordings()).toEqual([MUTED])
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/capture-templates?ignored=1')
  })

  it('un-mutes one by its id, with no body', async () => {
    const fetchMock = stub({ ok: true })

    await unmuteWording(MUTED.templateId)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/capture-templates/${MUTED.templateId}/unignore`)
    expect(init).toMatchObject({ method: 'POST' })
    expect(init.body).toBeUndefined()
  })
})
