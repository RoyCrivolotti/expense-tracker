import {
  fitWithin,
  outputTypeFor,
  qualityFor,
  shouldDownscale,
  type Dimensions,
} from '../domain/data/imageScaling'

export interface DownscaleResult {
  blob: Blob
  width: number
  height: number
}

export interface DownscaleLimits {
  maxEdge: number
  maxBytes: number
  skipUnderBytes: number
}

/**
 * The browser bits, isolated behind an interface.
 *
 * jsdom implements none of these, so the default implementation can only be
 * verified by hand in a real browser. Everything around it — the quality loop,
 * the skip rule, the failure path — is covered by injecting fakes.
 */
export interface CanvasDeps {
  decode(file: Blob): Promise<{ source: CanvasImageSource } & Dimensions>
  render(source: CanvasImageSource, size: Dimensions, quality: number): Promise<Blob | null>
}

export const browserCanvas: CanvasDeps = {
  decode: async (file) => {
    const bitmap = await createImageBitmap(file)
    return { source: bitmap, width: bitmap.width, height: bitmap.height }
  },
  render: (source, size, quality) =>
    new Promise((resolve) => {
      const canvas = document.createElement('canvas')
      canvas.width = size.width
      canvas.height = size.height
      const context = canvas.getContext('2d')
      if (!context) {
        resolve(null)
        return
      }
      context.drawImage(source, 0, 0, size.width, size.height)
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality)
    }),
}

/**
 * Shrink a receipt photo to something worth storing, or return null to mean
 * "upload the original".
 *
 * Returning null rather than throwing is deliberate: a browser that cannot give
 * us a canvas should still be able to attach a receipt, so long as the original
 * is inside the size limit. What must never happen is silently skipping the
 * limit — an oversized original is rejected by the caller, loudly.
 */
export async function downscaleImage(
  file: Blob,
  limits: DownscaleLimits,
  deps: CanvasDeps = browserCanvas,
): Promise<DownscaleResult | null> {
  if (outputTypeFor(file.type) === null) return null

  let decoded
  try {
    decoded = await deps.decode(file)
  } catch {
    // An image this browser cannot decode — HEIC on Chrome, say. The caller
    // falls back to the original and the server has the final say on the type.
    return null
  }

  const natural = { width: decoded.width, height: decoded.height }
  if (!shouldDownscale(natural, file.size, limits)) return null

  const size = fitWithin(natural, limits.maxEdge)
  for (let attempt = 0; ; attempt += 1) {
    const quality = qualityFor(attempt)
    if (quality === null) return null
    const blob = await deps.render(decoded.source, size, quality)
    if (!blob) return null
    if (blob.size <= limits.maxBytes) return { blob, ...size }
  }
}

/** A small preview for the strip, so a list of receipts costs a few KB. */
export async function renderThumbnail(
  file: Blob,
  edge: number,
  deps: CanvasDeps = browserCanvas,
): Promise<Blob | null> {
  if (outputTypeFor(file.type) === null) return null
  try {
    const decoded = await deps.decode(file)
    return await deps.render(decoded.source, fitWithin(decoded, edge), 0.7)
  } catch {
    return null
  }
}
