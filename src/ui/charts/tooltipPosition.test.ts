import { describe, expect, it } from 'vitest'
import { clampTooltipLeft, clampTooltipTop } from './tooltipPosition'

const bounds = { minLeft: 10, maxRight: 390, minTop: 20, maxBottom: 800 }

describe('clampTooltipLeft', () => {
  it('centers when there is room', () => {
    expect(clampTooltipLeft(200, 120, bounds)).toBe(140)
  })

  it('clamps to the right edge', () => {
    expect(clampTooltipLeft(350, 200, bounds)).toBe(190)
  })

  it('clamps to the left edge', () => {
    expect(clampTooltipLeft(30, 120, bounds)).toBe(10)
  })
})

describe('clampTooltipTop', () => {
  it('prefers above the anchor', () => {
    expect(clampTooltipTop(100, 60, bounds)).toBe(32)
  })

  it('flips below when not enough space above', () => {
    expect(clampTooltipTop(30, 60, bounds)).toBe(38)
  })
})
