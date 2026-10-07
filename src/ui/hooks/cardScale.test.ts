import { describe, expect, it } from 'vitest'
import { MIN_SCALE, effectiveScale, scaleFromDrag, scaledSize, stepScale } from './cardScale'

const box = { width: 800, height: 300 }
const chrome = 40

describe('effectiveScale', () => {
  it('is the size it is laid out at where that fits comfortably', () => {
    expect(effectiveScale(null, box, { width: 240, height: 120 }, chrome)).toBe(1)
  })

  it('is smaller, to take about two thirds of the box in the direction that is short of room, where it would not', () => {
    // 300 * 0.65 = 195, less 40 for the controls: 155 of height for content that is 310 tall.
    expect(effectiveScale(null, box, { width: 240, height: 310 }, chrome)).toBeCloseTo(0.5, 5)
    // 800 * 0.7 = 560 of width for content that is 1120 wide.
    expect(effectiveScale(null, box, { width: 1120, height: 100 }, chrome)).toBeCloseTo(0.5, 5)
  })

  it('is never larger than it is laid out at without being asked', () => {
    expect(effectiveScale(null, box, { width: 10, height: 10 }, chrome)).toBe(1)
  })

  it('is what was asked for, up to most of the box and no further', () => {
    const natural = { width: 240, height: 120 }
    expect(effectiveScale(1.5, box, natural, chrome)).toBe(1.5)
    // 0.9 of 800 over 240, and 0.9 of 300 less 40 over 120: the height is what runs out first.
    expect(effectiveScale(9, box, natural, chrome)).toBeCloseTo((300 * 0.9 - 40) / 120, 5)
  })

  it('is at least what is worth reading, unless the box has no room for that', () => {
    expect(effectiveScale(0.1, box, { width: 240, height: 120 }, chrome)).toBe(MIN_SCALE)
    expect(effectiveScale(0.1, box, { width: 240, height: 3000 }, chrome)).toBeLessThan(MIN_SCALE)
  })

  it('keeps a card that has grown inside the box, though it was asked to be larger', () => {
    const grown = { width: 240, height: 600 }
    expect(effectiveScale(1, box, grown, chrome)).toBeCloseTo((300 * 0.9 - 40) / 600, 5)
  })

  it('is one for a card that has no size yet, and not a number from dividing by nothing', () => {
    expect(effectiveScale(null, box, { width: 0, height: 0 }, chrome)).toBe(1)
    expect(effectiveScale(0.7, box, { width: 0, height: 0 }, chrome)).toBe(0.7)
  })

  it('is the least worth reading for a box that has no room at all', () => {
    expect(effectiveScale(null, { width: 0, height: 0 }, { width: 240, height: 120 }, chrome)).toBe(MIN_SCALE)
  })
})

describe('scaledSize', () => {
  it('scales the content and leaves the controls alone', () => {
    expect(scaledSize({ width: 240, height: 100 }, 40, 0.5)).toEqual({ width: 120, height: 90 })
  })
})

describe('scaleFromDrag', () => {
  const content = { width: 200, height: 100 }

  it('grows by the movement along the diagonal, as a share of it', () => {
    // The diagonal is 200x100, so moving the corner 40 along and 20 down is 20% more.
    expect(scaleFromDrag(1, content, { x: 40, y: 20 })).toBeCloseTo(1.2, 5)
  })

  it('shrinks when the pointer goes back, and not below nothing', () => {
    expect(scaleFromDrag(1, content, { x: -40, y: -20 })).toBeCloseTo(0.8, 5)
    expect(scaleFromDrag(1, content, { x: -4000, y: -2000 })).toBe(0)
  })

  it('is measured from the scale it began at', () => {
    expect(scaleFromDrag(0.5, content, { x: 40, y: 20 })).toBeCloseTo(0.6, 5)
  })

  it('leaves a content with no size as it is', () => {
    expect(scaleFromDrag(0.8, { width: 0, height: 0 }, { x: 10, y: 10 })).toBe(0.8)
  })
})

describe('stepScale', () => {
  it('grows and shrinks by a tenth, and one step undoes the other', () => {
    expect(stepScale(1, 1)).toBeCloseTo(1.1, 5)
    expect(stepScale(stepScale(1, 1), -1)).toBeCloseTo(1, 10)
  })
})
