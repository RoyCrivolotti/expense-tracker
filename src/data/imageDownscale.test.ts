import { describe, expect, it, vi } from 'vitest'
import {
  downscaleImage,
  renderThumbnail,
  type CanvasDeps,
  type DownscaleLimits,
} from './imageDownscale'

const limits: DownscaleLimits = { maxEdge: 1600, maxBytes: 400_000, skipUnderBytes: 100_000 }

function blobOf(size: number, type = 'image/jpeg'): Blob {
  return { size, type } as Blob
}

const noSource = {} as CanvasImageSource

/** Renders a blob whose size shrinks as quality drops, like a real encoder. */
function deps(overrides: Partial<CanvasDeps> = {}, natural = { width: 4000, height: 3000 }): CanvasDeps {
  return {
    decode: vi.fn().mockResolvedValue({ source: noSource, ...natural }),
    render: vi.fn((_source: CanvasImageSource, _size: unknown, quality: number) =>
      Promise.resolve(blobOf(Math.round(1_000_000 * quality))),
    ),
    ...overrides,
  }
}

describe('downscaleImage', () => {
  it('shrinks a large photo to the target box', async () => {
    const render = vi.fn().mockResolvedValue(blobOf(200_000))
    const result = await downscaleImage(blobOf(4_000_000), limits, deps({ render }))

    expect(result).toMatchObject({ width: 1600, height: 1200 })
    expect(render).toHaveBeenCalledWith(expect.anything(), { width: 1600, height: 1200 }, 0.82)
  })

  it('walks the quality ladder until the result fits', async () => {
    const render = vi.fn((_s: CanvasImageSource, _z: unknown, quality: number) =>
      Promise.resolve(blobOf(Math.round(1_000_000 * quality))),
    )
    const result = await downscaleImage(blobOf(4_000_000), limits, deps({ render }))

    // 0.82 -> 820k and 0.7 -> 700k both exceed 400k; 0.5 -> 500k still does, so
    // only a real encoder would stop earlier. Assert the walk, not the number.
    expect(render).toHaveBeenCalledTimes(4)
    expect(result).toBeNull()
  })

  it('stops at the first quality that fits', async () => {
    const render = vi.fn((_s: CanvasImageSource, _z: unknown, quality: number) =>
      Promise.resolve(blobOf(quality > 0.75 ? 500_000 : 300_000)),
    )
    const result = await downscaleImage(blobOf(4_000_000), limits, deps({ render }))

    expect(render).toHaveBeenCalledTimes(2)
    expect(result?.blob.size).toBe(300_000)
  })

  it('leaves a PDF alone', async () => {
    const decode = vi.fn()
    expect(
      await downscaleImage(blobOf(2_000_000, 'application/pdf'), limits, deps({ decode })),
    ).toBeNull()
    expect(decode).not.toHaveBeenCalled()
  })

  it('leaves a file that is already small alone', async () => {
    const render = vi.fn()
    expect(await downscaleImage(blobOf(50_000), limits, deps({ render }))).toBeNull()
    expect(render).not.toHaveBeenCalled()
  })

  it('falls back to the original when the browser cannot decode the image', async () => {
    // HEIC on Chrome. The server still has the final say on the type.
    const canvas = deps({ decode: vi.fn().mockRejectedValue(new Error('unsupported')) })

    expect(await downscaleImage(blobOf(4_000_000), limits, canvas)).toBeNull()
  })

  it('falls back to the original when no 2d context is available', async () => {
    const canvas = deps({ render: vi.fn().mockResolvedValue(null) })

    expect(await downscaleImage(blobOf(4_000_000), limits, canvas)).toBeNull()
  })
})

describe('renderThumbnail', () => {
  it('renders a small preview inside the thumbnail box', async () => {
    const render = vi.fn().mockResolvedValue(blobOf(10_000))
    await renderThumbnail(blobOf(4_000_000), 320, deps({ render }))

    expect(render).toHaveBeenCalledWith(expect.anything(), { width: 320, height: 240 }, 0.7)
  })

  it('has no thumbnail for a PDF', async () => {
    expect(await renderThumbnail(blobOf(1_000, 'application/pdf'), 320, deps())).toBeNull()
  })

  it('returns null rather than throwing when decoding fails', async () => {
    const canvas = deps({ decode: vi.fn().mockRejectedValue(new Error('nope')) })

    expect(await renderThumbnail(blobOf(4_000_000), 320, canvas)).toBeNull()
  })
})
