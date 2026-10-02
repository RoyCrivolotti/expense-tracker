import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** A stylesheet in src/ui, without its comments. */
function stylesheet(file: string): string {
  return readFileSync(resolve(process.cwd(), 'src/ui', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

/** The rules of a stylesheet, as selector and declarations, flattened out of any @media. */
function rules(file: string): { selector: string; body: string }[] {
  const css = stylesheet(file)
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

  it.each([
    ['components/SegmentedControl.module.css', '.active'],
    ['tabs/goals/goals.module.css', '.chipActive'],
  ])('gives %s %s a border in forced colours, where its fill is replaced', (file, selector) => {
    const forced = /@media \(forced-colors: active\) \{([\s\S]*?)\n\}/.exec(stylesheet(file))?.[1] ?? ''

    expect(forced).toMatch(new RegExp(`\\${selector}\\s*\\{[^}]*border:\\s*2px solid Highlight`))
  })

  it('lets a segment of the tall bar reach across the bar, which its own overflow would clip', () => {
    const tall = rules('components/SegmentedControl.module.css')
    const segment = tall.find((r) => r.selector === '.tall .seg')
    const reach = tall.find((r) => r.selector === '.tall .seg::before')

    expect(segment?.body).not.toMatch(/overflow(-[xy])?:\s*(hidden|clip|auto|scroll)/)
    expect(reach?.body).toMatch(/position:\s*absolute/)
  })

  it('extends the tap area of the section chips and the buttons beside them past their painted edges', () => {
    const css = stylesheet('tabs/goals/goals.module.css')

    expect(css).toContain('.sectionChips .chip::before')
    expect(css).toContain('.unsavedActions .btn::before')
  })

  it('ends the chip strip with room as wide as the fade that Save and Discard bring, and keeps focus out of it', () => {
    const all = rules('tabs/goals/goals.module.css')
    const spacer = all.find((r) => r.selector === '.sectionRowActions .sectionChips::after')
    const strip = all.find((r) => r.selector === '.sectionRowActions .sectionChips')

    expect(spacer?.body).toMatch(/width:\s*var\(--strip-fade\)/)
    expect(strip?.body).toMatch(/scroll-padding-inline-end:\s*var\(--strip-fade\)/)
  })
})
