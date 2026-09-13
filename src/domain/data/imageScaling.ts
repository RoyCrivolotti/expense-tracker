/**
 * Pure geometry and quality decisions for downscaling a receipt before upload.
 *
 * Separated from the canvas work on purpose: jsdom implements none of
 * `getContext('2d')`, `createImageBitmap`, `toBlob` or `OffscreenCanvas`, so
 * anything touching them can only ever be tested against a stub. Everything that
 * makes a *decision* lives here instead, where it is testable for real.
 */

export interface Dimensions {
  width: number
  height: number
}

/**
 * Fit within a square of `maxEdge`, preserving aspect ratio.
 *
 * Never upscales: a small receipt photo re-encoded larger would cost bytes and
 * gain nothing. Rounds to whole pixels and never returns zero, which a very wide
 * or very tall source would otherwise produce.
 */
export function fitWithin(dimensions: Dimensions, maxEdge: number): Dimensions {
  const { width, height } = dimensions
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * Re-encoding a file that is already small enough usually makes it *bigger* —
 * a screenshot-sized PNG becomes a lossy JPEG of similar size — and always
 * costs a generation of quality. Skip it.
 */
export function shouldDownscale(
  dimensions: Dimensions,
  byteSize: number,
  limits: { maxEdge: number; skipUnderBytes: number },
): boolean {
  if (byteSize <= limits.skipUnderBytes) return false
  return Math.max(dimensions.width, dimensions.height) > limits.maxEdge
}

/**
 * Quality ladder for the re-encode loop. Each attempt trades visible quality for
 * size; below the last step a receipt stops being readable, so the caller must
 * fail rather than keep going.
 */
export const QUALITY_LADDER = [0.82, 0.7, 0.6, 0.5] as const

export function qualityFor(attempt: number): number | null {
  return QUALITY_LADDER[attempt] ?? null
}

/**
 * PNG and WebP are re-encoded as JPEG: a photographed receipt is a photograph,
 * and JPEG is several times smaller than PNG for one. A PDF is passed through
 * untouched — it is already a document, and rasterising it would lose the text.
 */
export function outputTypeFor(sourceType: string): 'image/jpeg' | null {
  if (sourceType === 'application/pdf') return null
  return 'image/jpeg'
}
