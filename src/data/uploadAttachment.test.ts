import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiDataSource } from './apiDataSource'

/**
 * The upload path assembles a multipart body and decides whether to send the
 * original or a downscaled copy. jsdom cannot decode an image, so downscaling
 * always declines here — which is exactly the fallback path worth pinning:
 * the original must still be sent, not dropped.
 */
function captureUpload() {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ id: 1 }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return () => (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body as FormData
}

function file(name = 'hotel.jpg', type = 'image/jpeg'): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], name, { type })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiDataSource.uploadAttachment', () => {
  it('sends the transaction id and the file under the names the route reads', async () => {
    const body = captureUpload()

    await apiDataSource.uploadAttachment!(7, file())

    expect(body().get('transactionId')).toBe('7')
    expect(body().get('file')).toBeTruthy()
  })

  it('keeps the original filename, which becomes the download name', async () => {
    const body = captureUpload()

    await apiDataSource.uploadAttachment!(7, file('Madrid hotel.jpg'))

    expect((body().get('file') as File).name).toBe('Madrid hotel.jpg')
  })

  it('sends the original when the browser cannot downscale it', async () => {
    // The server sniffs and size-checks regardless, so falling back is safe;
    // silently sending nothing would not be.
    const body = captureUpload()

    await apiDataSource.uploadAttachment!(7, file())

    expect(body().get('file')).toBeTruthy()
    expect(body().get('width')).toBeNull()
  })

  it('sends a PDF untouched, with no thumbnail', async () => {
    const body = captureUpload()

    await apiDataSource.uploadAttachment!(7, file('invoice.pdf', 'application/pdf'))

    expect(body().get('file')).toBeTruthy()
    expect(body().get('thumb')).toBeNull()
  })

  it('posts to the attachments endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await apiDataSource.uploadAttachment!(7, file())

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/expenses/attachments')
  })

  it('deletes through the attachment route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ deleted: 3 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await apiDataSource.deleteAttachment!(3)

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/expenses/attachments/3')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' })
  })
})
