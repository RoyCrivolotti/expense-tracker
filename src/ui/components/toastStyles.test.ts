import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(file: string): string {
  return readFileSync(resolve(process.cwd(), 'src/ui', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

/** The custom properties a theme block declares, by name. */
function tokens(selector: string): Map<string, string> {
  const start = source('theme.css').indexOf(`${selector} {`)
  const body = source('theme.css').slice(start).split('}')[0] ?? ''
  return new Map([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1] ?? '', (m[2] ?? '').trim()]))
}

type Rgb = [number, number, number]

/** A token's colour, following `var()` and the one `color-mix` toward black the theme uses. */
function colour(value: string, theme: Map<string, string>): Rgb {
  const ref = /^var\((--[\w-]+)\)$/.exec(value)
  if (ref) return colour(theme.get(ref[1] ?? '') ?? '', theme)
  const mix = /^color-mix\(in srgb, (.+) (\d+)%, black\)$/.exec(value)
  if (mix) return colour(mix[1] ?? '', theme).map((c) => c * (Number(mix[2]) / 100)) as Rgb
  const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(value)
  const hex = short ? short.slice(1).map((d) => d + d).join('') : /^#([\da-f]{6})$/i.exec(value)?.[1]
  if (!hex) throw new Error(`not a colour: ${value}`)
  const n = parseInt(hex, 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as Rgb
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** The background and text a toast tone declares in Toast.module.css. */
function toneColours(tone: string): { background: string; color: string } {
  const body = new RegExp(`\\.${tone}\\s*\\{([^}]*)\\}`).exec(source('components/Toast.module.css'))?.[1] ?? ''
  return {
    background: /background:\s*([^;]+);/.exec(body)?.[1]?.trim() ?? '',
    color: /(?:^|[;\s])color:\s*([^;]+);/.exec(body)?.[1]?.trim() ?? '',
  }
}

describe('toast tones', () => {
  describe.each([
    ['light', "html[data-exp-theme='light']"],
    ['dark', "html[data-exp-theme='dark']"],
  ])('in the %s theme', (_name, selector) => {
    it.each(['success', 'error'])('keeps the %s message readable (at least 4.5:1)', (tone) => {
      const theme = tokens(selector)
      const { background, color } = toneColours(tone)

      expect(contrast(colour(color, theme), colour(background, theme))).toBeGreaterThanOrEqual(4.5)
    })
  })
})
