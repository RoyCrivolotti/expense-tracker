import { describe, expect, it } from 'vitest'
import { SCENARIO_COLORS } from '../../../engine'
import { contrastRatio, scenarioInk } from './scenarioInk'

const LIGHT = '#eeeeec'
const DARK = '#181b20'

/** The two colours inside `light-dark(a, b)`, or the colour twice when it was left alone. */
function sides(ink: string): [string, string] {
  const m = /^light-dark\((#[0-9a-f]{6}), (#[0-9a-f]{6})\)$/i.exec(ink)
  return m ? [m[1]!, m[2]!] : [ink, ink]
}

describe('scenarioInk', () => {
  it.each([...SCENARIO_COLORS])('draws %s at 3:1 or better in both themes', (color) => {
    const [light, dark] = sides(scenarioInk(color))
    expect(contrastRatio(light, LIGHT)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(dark, DARK)).toBeGreaterThanOrEqual(3)
  })

  it('darkens the pale presets for the light theme and keeps the hue', () => {
    const [light] = sides(scenarioInk('#f59e0b'))
    expect(light).not.toBe('#f59e0b')
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(light.slice(i, i + 2), 16)) as [number, number, number]
    // Amber stays amber: red over green over blue.
    expect(r).toBeGreaterThan(g)
    expect(g).toBeGreaterThan(b)
  })

  it('leaves a colour that already has the contrast exactly as it was', () => {
    // Indigo is 3.9:1 on both cards.
    expect(scenarioInk('#6366f1')).toBe('#6366f1')
  })

  it('lightens a dark custom colour for the dark theme', () => {
    const [light, dark] = sides(scenarioInk('#1e293b'))
    expect(light).toBe('#1e293b')
    expect(contrastRatio(dark, DARK)).toBeGreaterThanOrEqual(3)
    expect(dark).not.toBe('#1e293b')
  })

  it('passes anything that is not a six digit hex through, since it cannot be measured', () => {
    expect(scenarioInk('rebeccapurple')).toBe('rebeccapurple')
    expect(scenarioInk('#abc')).toBe('#abc')
  })

  it('stops at black or white for a colour that cannot reach 3:1 on a ground', () => {
    // Mid grey has under 3:1 against both grounds one way, so the walk ends at an extreme, not forever.
    const [light, dark] = sides(scenarioInk('#808080'))
    expect(contrastRatio(light, LIGHT)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(dark, DARK)).toBeGreaterThanOrEqual(3)
  })
})
