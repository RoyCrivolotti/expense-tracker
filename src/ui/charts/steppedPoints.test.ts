import { describe, expect, it } from 'vitest'
import { steppedPoints } from './steppedPoints'

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
