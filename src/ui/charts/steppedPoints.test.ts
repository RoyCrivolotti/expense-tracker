import { describe, expect, it } from 'vitest'
import { steppedPoints, placeX, placesOf, valueAtPlace } from './steppedPoints'

const x = (i: number) => i * 10
const y = (v: number) => 100 - v

describe('steppedPoints', () => {
  it('is one point for each value when nothing steps', () => {
    expect(steppedPoints([10, 20, 30], undefined, x, y)).toEqual([
      { x: 0, y: 90 },
      { x: 10, y: 80 },
      { x: 20, y: 70 },
    ])
    expect(steppedPoints([10, 20, 30], [10, 20, 30], x, y)).toHaveLength(3)
  })

  it('goes up to the value before a step, then straight down to the value after it', () => {
    // Year 2 reaches 60 before a payment and is 25 after it.
    expect(steppedPoints([10, 20, 25], [10, 20, 60], x, y)).toEqual([
      { x: 0, y: 90 },
      { x: 10, y: 80 },
      { x: 20, y: 40 },
      { x: 20, y: 75 },
    ])
  })

  it('steps up for an inflow just the same', () => {
    expect(steppedPoints([10, 50], [10, 20], x, y)).toEqual([
      { x: 0, y: 90 },
      { x: 10, y: 80 },
      { x: 10, y: 50 },
    ])
  })

  it('leaves a value with no pre-step value, or a shorter list, as it is', () => {
    expect(steppedPoints([10, 20, 30], [10], x, y)).toHaveLength(3)
  })

  it('is nothing for no values', () => {
    expect(steppedPoints([], [], x, y)).toEqual([])
  })
})

describe('a series placed part-way along the axis', () => {
  const later = { values: [100, 150, 120], preStep: [100, 160, 140], xs: [1.5, 2.5, 3.5] }

  it('draws each value at its own x, and a series without one at its place', () => {
    const x = (i: number) => i * 10
    expect([0, 1, 2].map(placeX(later, x))).toEqual([15, 25, 35])
    expect(placeX({}, x)).toBe(x)
  })

  it('reaches up to the axis place at or past its last x', () => {
    expect(placesOf(later)).toBe(5)
    expect(placesOf({ values: [1, 2], xs: [0.5, 3] })).toBe(4)
    // A float a hair past a whole place is that place, not the next.
    expect(placesOf({ values: [1, 2], xs: [0.1, 0.1 + 3 - 0.1 + 1e-12] })).toBe(4)
    expect(placesOf({ values: [1, 2, 3] })).toBe(3)
  })

  it('reads its value at an axis place along the line it draws, and nothing outside it', () => {
    expect(valueAtPlace(later, 1)).toBeUndefined()
    expect(valueAtPlace(later, 4)).toBeUndefined()
    // From 100 at 1,5 towards the 160 the next year reached before its step, halfway.
    expect(valueAtPlace(later, 2)).toBe(130)
    expect(valueAtPlace(later, 3)).toBe(150 + 0.5 * (140 - 150))
    expect(valueAtPlace({ values: [5, 6], xs: [2, 3] }, 3)).toBe(6)
    expect(valueAtPlace({ values: [5, 6], xs: [2, 3] }, 2)).toBe(5)
    expect(valueAtPlace({ values: [], xs: [] }, 0)).toBeUndefined()
  })

  it('reads a series on the axis’ places at the place, as it always has', () => {
    expect(valueAtPlace({ values: [1, 2, 3] }, 1)).toBe(2)
    expect(valueAtPlace({ values: [1, 2, 3] }, 3)).toBeUndefined()
  })
})
