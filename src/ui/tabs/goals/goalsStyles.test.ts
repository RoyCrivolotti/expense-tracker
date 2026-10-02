import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NARROW_MQ } from './useGoalsNarrow'

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
        // A slider's thumb or filled track is painted in the accent and holds no text.
        if (selector.includes('::')) continue
        const color = /(?:^|;|\s)color:\s*([^;]+);/.exec(body)?.[1]?.trim()
        expect(color, `${selector} in ${file}`).toBe('var(--color-accent-contrast)')
      }
    }
  })

  it.each([
    ['components/SegmentedControl.module.css', '.active'],
    ['tabs/goals/goals.module.css', '.chipActive'],
  ])('gives %s %s a border in forced colours, where its fill is replaced', (file, selector) => {
    const forced = [...stylesheet(file).matchAll(/@media \(forced-colors: active\) \{([\s\S]*?)\n\}/g)]
      .map((m) => m[1])
      .join('\n')

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

describe('the width at which Goals changes from the phone layout to the wide one', () => {
  const narrowMax = Number(/\(max-width:\s*(\d+)px\)/.exec(NARROW_MQ)?.[1])
  const wideMin = narrowMax + 1

  /** The pixel widths a stylesheet's media queries switch at, for one kind of bound. */
  function widths(file: string, bound: 'max' | 'min'): number[] {
    const found = stylesheet(file).matchAll(new RegExp(`@media[^{]*\\(${bound}-width:\\s*(\\d+)px\\)`, 'g'))
    return [...found].map((m) => Number(m[1]))
  }

  // Breakpoints of their own: a phone's narrow rows (560) and where inputs are held to 16px so
  // iOS does not zoom into them (719). Anything else in these files that is a max-width query
  // must be the Goals breakpoint, so one copy cannot be edited without the others.
  const OTHER_MAX_WIDTHS = [560, 719]

  it('is read from a media query in the code, which has to be a max-width', () => {
    expect(Number.isInteger(narrowMax)).toBe(true)
  })

  it.each(['tabs/goals/goals.module.css', 'tabs/goals/progress.module.css'])(
    'is the one that %s switches to the phone layout at',
    (file) => {
      const found = widths(file, 'max')

      expect(found).toContain(narrowMax)
      expect(found.filter((w) => w !== narrowMax && !OTHER_MAX_WIDTHS.includes(w))).toEqual([])
    },
  )

  it.each(['tabs/goals/goals.module.css', 'nav/AppShell.module.css'])(
    'is where %s starts the wide layout, one pixel up',
    (file) => {
      expect(widths(file, 'min')).toContain(wideMin)
    },
  )

  it('leaves no query of the goals stylesheet a pixel off, which would show both layouts at one width', () => {
    expect(widths('tabs/goals/goals.module.css', 'min').filter((w) => w === narrowMax)).toEqual([])
    expect(widths('tabs/goals/goals.module.css', 'max').filter((w) => w === wideMin)).toEqual([])
  })

  it('draws the slider in every browser engine, and keeps it visible in forced colours', () => {
    const css = stylesheet('tabs/goals/goals.module.css')
    const forced = [...css.matchAll(/@media \(forced-colors: active\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n')

    // The native control is replaced, so each engine needs its own parts drawn.
    for (const part of ['::-webkit-slider-runnable-track', '::-webkit-slider-thumb', '::-moz-range-track', '::-moz-range-progress', '::-moz-range-thumb']) {
      expect(css, part).toContain(`.range${part}`)
    }
    // Forced colours strips the track's gradient and the thumb's fill unless the slider opts out
    // and names them in system colours; without it there is a thumb and no track.
    expect(forced).toMatch(/\.range\s*\{[^}]*forced-color-adjust:\s*none/)
    expect(forced).toContain('Highlight')
  })

  it.each(['::-webkit-slider-thumb', '::-moz-range-thumb'])(
    'paints the slider knob %s as one colour that is the same in every theme',
    (part) => {
      // The first rule for the part is the everyday one; the forced-colours one comes later.
      const knob = rules('tabs/goals/goals.module.css').find((r) => r.selector === `.range${part}`)?.body ?? ''

      expect(knob).toContain('background: var(--color-accent)')
      // A ring in the card's colour or a shadow shows on one theme and vanishes on the other, so
      // the knob looks outlined in light mode and flat in dark.
      expect(knob).not.toMatch(/var\(--color-surface\)/)
      expect(knob).not.toMatch(/box-shadow/)
    },
  )
})
