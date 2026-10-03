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

  // The wide page is laid out by components that only mount above this width (useGoalsNarrow), so
  // the Goals stylesheet has nothing left to switch on; the app shell still widens the page for it.
  it.each(['nav/AppShell.module.css'])('is where %s starts the wide layout, one pixel up', (file) => {
    expect(widths(file, 'min')).toContain(wideMin)
  })

  it('leaves no query of the goals stylesheet a pixel off, which would show both layouts at one width', () => {
    expect(widths('tabs/goals/goals.module.css', 'min').filter((w) => w === narrowMax)).toEqual([])
    expect(widths('tabs/goals/goals.module.css', 'max').filter((w) => w === wideMin)).toEqual([])
  })
})

describe('the wide plan on a touch screen', () => {
  const css = stylesheet('tabs/goals/desktop/planDesktop.module.css')
  const block = (query: string) => new RegExp(`@media \\(${query}\\) \\{([\\s\\S]*?)\\n\\}`).exec(css)?.[1] ?? ''

  it('previews a star taking its input out of the bar only where a pointer can leave it', () => {
    // A touch screen keeps :hover on what was last under the finger: when one star left the bar
    // the next lever's slid under that spot and drew itself as removed while it was still in.
    const hover = block('hover: hover')
    expect(hover).toMatch(/\.starOn:hover/)
    expect(css.replace(hover, '')).not.toMatch(/\.star(On)?:hover/)
  })

  it('takes the controls to about 44px for a finger, with the star reaching up and out but not down', () => {
    const coarse = block('pointer: coarse')
    expect(coarse).toMatch(/min-height:\s*2\.75rem/)
    expect(coarse).toMatch(/\.menuTrigger\s*\{[^}]*height:\s*2\.75rem/)
    // Below the star is the figure it belongs to, which a tap on it must not take out of the bar.
    expect(coarse).toMatch(/\.star::after\s*\{[^}]*inset:\s*-0\.9rem -0\.9rem -0\.15rem/)
  })
})

describe('the swatches that key a colour on a chart', () => {
  // In forced colours the browser paints a background the page colour, so a swatch that is not
  // exempted shows nothing and the lines it names have no key.
  it.each([
    ['tabs/goals/goals.module.css', '.swatch'],
    ['charts/LiveLegend.module.css', '.swatch'],
    ['charts/ChartLegend.module.css', '.swatch'],
    ['charts/charts.module.css', '.swatch'],
    ['charts/charts.module.css', '.tooltipSwatch'],
  ])('keeps its colour in forced colours: %s %s', (file, selector) => {
    const sized = rules(file).filter((r) => r.selector === selector && /width:/.test(r.body))

    expect(sized.length).toBeGreaterThan(0)
    for (const r of sized) expect(r.body).toMatch(/forced-color-adjust:\s*none/)
  })
})

describe('the segmented controls of the wide page on a touch screen', () => {
  const css = stylesheet('tabs/goals/goals.module.css')
  const narrowMax = Number(/\(max-width:\s*(\d+)px\)/.exec(NARROW_MQ)?.[1])

  it('are held to 44px for a coarse pointer from the wide layout up, and not under it', () => {
    const block = /@media \(pointer: coarse\) and \(min-width: (\d+)px\) \{([\s\S]*?)\n\}/.exec(css)

    expect(block).not.toBeNull()
    // The same width the page goes wide at, so the phone's layout is not touched.
    expect(Number(block![1])).toBe(narrowMax + 1)
    expect(block![2]).toMatch(/button\[role='radio'\]/)
    expect(block![2]).toMatch(/min-height:\s*2\.75rem/)
  })
})

describe('small muted text', () => {
  it('is not faded further with opacity, which took the note under Where you are today to 4.2:1', () => {
    const note = rules('tabs/goals/goals.module.css').find((r) => r.selector === '.nowListNote')

    expect(note?.body).toMatch(/color:\s*var\(--color-text-muted\)/)
    expect(note?.body).not.toMatch(/opacity/)
  })
})
