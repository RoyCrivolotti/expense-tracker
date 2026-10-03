import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

/** Every `--exp-danger` fill in the theme with the text colour the same block gives it. */
function dangerPairs(): { fill: string; text: string | undefined }[] {
  const css = readFileSync(resolve(process.cwd(), 'src/ui/theme.css'), 'utf8')
  return [...css.matchAll(/--exp-danger:\s*(#[0-9a-fA-F]{6});([^}]*)}/g)].map((m) => ({
    fill: m[1]!,
    text: /--exp-danger-contrast:\s*(#[0-9a-fA-F]{6});/.exec(m[2] ?? '')?.[1],
  }))
}

describe('the text on a solid danger fill', () => {
  it('is named in every theme block that names the fill', () => {
    const pairs = dangerPairs()

    expect(pairs.length).toBe(4)
    for (const { text } of pairs) expect(text).toBeDefined()
  })

  it('reads at 4.5:1 or better against the fill, in the light theme and the dark one', () => {
    for (const { fill, text } of dangerPairs()) {
      expect(contrast(fill, text!), `${text} on ${fill}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
