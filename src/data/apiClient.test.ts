import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, req, reqMultipart } from './apiClient'

function response(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('req', () => {
  it('returns the parsed body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ id: 1 })))

    await expect(req<{ id: number }>('/x')).resolves.toEqual({ id: 1 })
  })

  it('sends credentials, so the Access cookie rides along', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({}))
    vi.stubGlobal('fetch', fetchMock)

    await req('/x')

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: 'same-origin' })
  })

  it('turns the server’s {error} into an ApiError carrying the status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ error: 'Invalid flagId' }, { status: 400 })),
    )

    await expect(req('/x')).rejects.toMatchObject({ message: 'Invalid flagId', status: 400 })
  })

  it('falls back to a generic message when the body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 503 })),
    )

    await expect(req('/x')).rejects.toMatchObject({ message: 'Request failed (503)', status: 503 })
  })
})

describe('reqMultipart', () => {
  it('posts the form and returns the parsed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ id: 9 }))
    vi.stubGlobal('fetch', fetchMock)
    const form = new FormData()
    form.set('a', 'b')

    await expect(reqMultipart<{ id: number }>('/upload', form)).resolves.toEqual({ id: 9 })
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', body: form })
  })

  it('sets no content-type, so the browser can write the multipart boundary', async () => {
    // Supplying one corrupts the body: the boundary would be missing.
    const fetchMock = vi.fn().mockResolvedValue(response({}))
    vi.stubGlobal('fetch', fetchMock)

    await reqMultipart('/upload', new FormData())

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.headers).toBeUndefined()
  })

  it('surfaces a rejection the same way req does', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ error: 'Receipts must be 5 MB or smaller' }, { status: 400 })),
    )

    await expect(reqMultipart('/upload', new FormData())).rejects.toBeInstanceOf(ApiError)
  })
})
