import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** The rules of a stylesheet in src/ui, as selector and declarations, flattened out of any @media. */
function rules(file: string): { selector: string; body: string }[] {
  const css = readFileSync(resolve(process.cwd(), 'src/ui', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  return [...css.matchAll(/([^{};]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: (m[1] ?? '').trim(),
    body: m[2] ?? '',
  }))
}

describe('goals styles', () => {
  it('sets text on the accent colour in the contrast colour, which is dark where the accent is light', () => {
    for (const file of ['tabs/goals/goals.module.css', 'tabs/goals/progress.module.css', 'components/SegmentedControl.module.css']) {
      for (const { selector, body } of rules(file)) {
        if (!/background(-color)?:\s*var\(--color-accent\)\s*;/.test(body)) continue
        const color = /(?:^|;|\s)color:\s*([^;]+);/.exec(body)?.[1]?.trim()
        expect(color, `${selector} in ${file}`).toBe('var(--color-accent-contrast)')
      }
    }
  })
})
