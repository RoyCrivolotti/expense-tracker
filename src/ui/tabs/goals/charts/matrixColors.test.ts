import { describe, expect, it } from 'vitest'
import { cellColors } from './matrixColors'

function luminance(hex: string): number {
  const full = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

/** Both ends of every bucket, plus a miss (null) and "now" (0). */
const YEARS = [null, 0, 1, 10, 11, 20, 21, 30, 31, 40]

describe('cellColors', () => {
  it.each(YEARS)('has readable text on the background for %s years', (years) => {
    const { background, color } = cellColors(years)
    expect(contrast(background, color)).toBeGreaterThanOrEqual(4.5)
  })

  it('gives white only to the dark green of "now"', () => {
    expect(cellColors(0).color).toBe('#fff')
    for (const years of YEARS.filter((y) => y !== 0)) expect(cellColors(years).color).toBe('#111')
  })
})
