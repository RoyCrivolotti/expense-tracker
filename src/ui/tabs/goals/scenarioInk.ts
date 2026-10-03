/**
 * A scenario's colour as it is drawn. The stored colour is the user's pick, and half of the preset
 * palette (amber, lime, cyan, emerald) is under 3:1 against the chart card in the light theme, the
 * floor for a graphical object, so a line in it is thin and pale. The ink is the same colour taken
 * toward black (light theme) or white (dark theme) just far enough to reach it, and one that
 * already does is left as it is.
 */

/** The chart card's ground in each theme: 4% of the text colour over the page (theme.css). */
const LIGHT_GROUND = '#eeeeec'
const DARK_GROUND = '#181b20'
const MIN_CONTRAST = 3
const STEP = 0.04

const HEX = /^#([0-9a-f]{6})$/i

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** `hex` moved toward `target` in small steps until it has `MIN_CONTRAST` against `ground`. */
function toward(hex: string, target: [number, number, number], ground: string): string {
  const from = channels(hex)
  let mix = 0
  let out = hex
  while (contrastRatio(out, ground) < MIN_CONTRAST && mix < 1) {
    mix = Math.min(1, mix + STEP)
    out = toHex(from.map((c, i) => c + (target[i]! - c) * mix) as [number, number, number])
  }
  return out
}

/** The ink for the light theme, the dark theme, and a `light-dark()` of the two (or the colour itself when they agree). */
export function scenarioInk(color: string): string {
  if (!HEX.test(color)) return color
  const light = toward(color, [0, 0, 0], LIGHT_GROUND)
  const dark = toward(color, [255, 255, 255], DARK_GROUND)
  return light === color && dark === color ? color : `light-dark(${light}, ${dark})`
}
