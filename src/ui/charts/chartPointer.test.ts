import { describe, expect, it } from 'vitest'
import { quarterTurnX } from './chartPointer'

describe('quarterTurnX', () => {
  it('reads the pointer height in the box as the position along the axis', () => {
    // A 400-wide chart drawn turned: its box is 300 tall on the screen and starts 100px down.
    const rect = { top: 100, height: 300 }
    expect(quarterTurnX(100, rect, 400)).toBe(0)
    expect(quarterTurnX(400, rect, 400)).toBe(400)
    expect(quarterTurnX(250, rect, 400)).toBe(200)
  })

  it('scales by the box, so a chart shown smaller than its viewBox still maps onto it', () => {
    expect(quarterTurnX(150, { top: 0, height: 150 }, 600)).toBe(600)
    expect(quarterTurnX(75, { top: 0, height: 150 }, 600)).toBe(300)
  })

  it('goes outside the viewBox for a pointer past the box, for the nearest step to be chosen from', () => {
    expect(quarterTurnX(-50, { top: 0, height: 100 }, 100)).toBe(-50)
    expect(quarterTurnX(250, { top: 0, height: 100 }, 100)).toBe(250)
  })

  it('has no answer for a box with no height', () => {
    expect(quarterTurnX(10, { top: 0, height: 0 }, 400)).toBeNull()
    expect(quarterTurnX(10, { top: 0, height: Number.NaN }, 400)).toBeNull()
  })
})
