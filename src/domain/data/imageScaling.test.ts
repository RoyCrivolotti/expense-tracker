import { describe, expect, it } from 'vitest'
import {
  fitWithin,
  outputTypeFor,
  qualityFor,
  QUALITY_LADDER,
  shouldDownscale,
} from './imageScaling'

describe('fitWithin', () => {
  it('leaves an image that already fits alone', () => {
    expect(fitWithin({ width: 800, height: 600 }, 1600)).toEqual({ width: 800, height: 600 })
  })

  it('never upscales, even a tiny image', () => {
    expect(fitWithin({ width: 40, height: 30 }, 1600)).toEqual({ width: 40, height: 30 })
  })

  it('scales a landscape photo by its long edge', () => {
    expect(fitWithin({ width: 4000, height: 3000 }, 1600)).toEqual({ width: 1600, height: 1200 })
  })

  it('scales a portrait photo by its long edge', () => {
    expect(fitWithin({ width: 3000, height: 4000 }, 1600)).toEqual({ width: 1200, height: 1600 })
  })

  it('rounds to whole pixels', () => {
    const fitted = fitWithin({ width: 1000, height: 333 }, 500)

    expect(Number.isInteger(fitted.width)).toBe(true)
    expect(Number.isInteger(fitted.height)).toBe(true)
    expect(fitted).toEqual({ width: 500, height: 167 })
  })

  it('never collapses a very wide image to zero height', () => {
    // A panoramic scan: naive rounding gives 0, and a zero-height canvas throws.
    expect(fitWithin({ width: 10_000, height: 3 }, 320)).toEqual({ width: 320, height: 1 })
  })

  it('keeps a square square', () => {
    expect(fitWithin({ width: 2000, height: 2000 }, 320)).toEqual({ width: 320, height: 320 })
  })

  it('treats an image exactly at the limit as fitting', () => {
    expect(fitWithin({ width: 1600, height: 900 }, 1600)).toEqual({ width: 1600, height: 900 })
  })
})

describe('shouldDownscale', () => {
  const limits = { maxEdge: 1600, skipUnderBytes: 300_000 }

  it('re-encodes a large photo', () => {
    expect(shouldDownscale({ width: 4000, height: 3000 }, 4_000_000, limits)).toBe(true)
  })

  it('leaves a small file alone even when its pixel dimensions are large', () => {
    // Re-encoding this would usually make it bigger and always lose a generation.
    expect(shouldDownscale({ width: 4000, height: 3000 }, 120_000, limits)).toBe(false)
  })

  it('leaves an already-small image alone', () => {
    expect(shouldDownscale({ width: 800, height: 600 }, 900_000, limits)).toBe(false)
  })
})

describe('qualityFor', () => {
  it('walks down the ladder', () => {
    expect(qualityFor(0)).toBe(0.82)
    expect(qualityFor(QUALITY_LADDER.length - 1)).toBe(0.5)
  })

  it('returns null past the last step, so the caller fails instead of looping', () => {
    expect(qualityFor(QUALITY_LADDER.length)).toBeNull()
  })

  it('gets monotonically more lossy', () => {
    const steps = [...QUALITY_LADDER]
    expect(steps).toEqual([...steps].sort((a, b) => b - a))
  })
})

describe('outputTypeFor', () => {
  it('re-encodes raster images as JPEG', () => {
    expect(outputTypeFor('image/png')).toBe('image/jpeg')
    expect(outputTypeFor('image/webp')).toBe('image/jpeg')
    expect(outputTypeFor('image/jpeg')).toBe('image/jpeg')
  })

  it('passes a PDF through, since rasterising it would lose the text', () => {
    expect(outputTypeFor('application/pdf')).toBeNull()
  })
})
