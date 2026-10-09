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
    ['tabs/tabs.module.css', '.presetChipOn'],
  ])('gives %s %s a border in forced colours, where its fill is replaced', (file, selector) => {
    const forced = /@media \(forced-colors: active\) \{([\s\S]*?)\n\}/.exec(stylesheet(file))?.[1] ?? ''

    expect(forced).toMatch(new RegExp(`\\${selector}\\s*\\{[^}]*border:\\s*2px solid Highlight`))
  })

  it('draws the amounts in the gap split in the success and danger colours', () => {
    const progress = rules('tabs/goals/progress.module.css')
    const colour = (selector: string) => /(?:^|;|\s)color:\s*([^;]+);/.exec(progress.find((r) => r.selector === selector)?.body ?? '')?.[1]?.trim()

    expect(colour('.gapAmountUp')).toBe('var(--exp-success)')
    expect(colour('.gapAmountDown')).toBe('var(--exp-danger)')
  })

  it('lets a row of the gap split wrap, so an amount keeps its width at large text and stays inside its box', () => {
    const row = rules('tabs/goals/progress.module.css').find((r) => r.selector === '.gapRow')

    expect(row?.body).toMatch(/flex-wrap:\s*wrap/)
  })

  it('lets a segment of the tall bar reach across the bar, which its own overflow would clip', () => {
    const tall = rules('components/SegmentedControl.module.css')
    const segment = tall.find((r) => r.selector === '.tall .seg')
    const reach = tall.find((r) => r.selector === '.tall .seg::before')

    expect(segment?.body).not.toMatch(/overflow(-[xy])?:\s*(hidden|clip|auto|scroll)/)
    expect(reach?.body).toMatch(/position:\s*absolute/)
  })

  it('draws the amounts in the monthly-investing list in the success and danger colours', () => {
    const goals = rules('tabs/goals/goals.module.css')
    const colour = (selector: string) => /(?:^|;|\s)color:\s*([^;]+);/.exec(goals.find((r) => r.selector === selector)?.body ?? '')?.[1]?.trim()

    expect(colour('.lifeEventInflow')).toBe('var(--exp-success)')
    expect(colour('.lifeEventOutflow')).toBe('var(--exp-danger)')
  })

  it('extends the tap area of the section chips and the buttons beside them past their painted edges', () => {
    const css = stylesheet('tabs/goals/goals.module.css')

    expect(css).toContain('.sectionChips .chip::before')
    expect(css).toContain('.unsavedActions .btn::before')
  })

  it('never cuts the month a change in the monthly investing starts in, which is the point of its line: the row wraps instead', () => {
    const all = rules('tabs/goals/goals.module.css')
    const label = all.find((r) => r.selector === '.lifeEventStepLabel')
    const row = all.find((r) => r.selector === '.lifeEventRow')

    expect(label?.body).toMatch(/flex:\s*1 0 auto/)
    expect(label?.body).not.toMatch(/overflow:\s*hidden|text-overflow/)
    expect(row?.body).toMatch(/flex-wrap:\s*wrap/)
  })

  it('keeps Edit and the remove cross of a change together on one line when the row wraps', () => {
    const buttons = rules('tabs/goals/goals.module.css').find((r) => r.selector === '.lifeEventRowButtons')

    expect(buttons?.body).toMatch(/display:\s*inline-flex/)
    expect(buttons?.body).toMatch(/flex-shrink:\s*0/)
    expect(buttons?.body).toMatch(/white-space:\s*nowrap/)
  })

  it('ends the chip strip with room as wide as the fade that Save and Discard bring, and keeps focus out of it', () => {
    const all = rules('tabs/goals/goals.module.css')
    const spacer = all.find((r) => r.selector === '.sectionRowActions .sectionChips::after')
    const strip = all.find((r) => r.selector === '.sectionRowActions .sectionChips')

    expect(spacer?.body).toMatch(/width:\s*var\(--strip-fade\)/)
    expect(strip?.body).toMatch(/scroll-padding-inline-end:\s*var\(--strip-fade\)/)
  })

  it('keeps the stepper under the spending where it is when the line above it grows from two lines to three, on a phone', () => {
    const css = stylesheet('tabs/goals/goals.module.css')

    expect(css).toMatch(/@media \(max-width: \d+px\) \{[^@]*\.fieldHintReserve\s*\{[^}]*min-height:\s*calc\(3 \* 1\.4em\)/)
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
    expect(coarse).toMatch(/\.leverHead \.star::after\s*\{[^}]*inset:\s*-1\.5rem -0\.9rem -0\.15rem/)
    // In the panel the area is the height of the star's own row, so it reaches into no other row.
    expect(coarse).toMatch(/\.starrable > \.star::after\s*\{[^}]*inset:\s*-0\.825rem -0\.9rem/)
  })

  it('makes a star\'s tap area 44px high wherever it is, a star being 1.1rem', () => {
    const coarse = block('pointer: coarse')
    const height = (selector: string) => {
      const [top = '0', , bottom = top] = new RegExp(`${selector}\\s*\\{[^}]*inset:\\s*([^;]*);`).exec(coarse)?.[1]?.split(' ') ?? []
      return 1.1 - Number.parseFloat(top) - Number.parseFloat(bottom)
    }
    expect(height('\\.leverHead \\.star::after')).toBeCloseTo(2.75, 5)
    expect(height('\\.starrable > \\.star::after')).toBeCloseTo(2.75, 5)
  })

  describe("a star's tap area", () => {
    const plan = rules('tabs/goals/desktop/planDesktop.module.css')
    const body = (selector: string) => plan.find((r) => r.selector === selector)?.body ?? ''

    it('sits under the inputs it reaches over, in a stacking context the columns share', () => {
      // The area is wider than the gutter, and over the end of the column before it was a slider's
      // or a + button's press that starred an input instead.
      expect(body('.columns')).toMatch(/isolation:\s*isolate/)
      expect(body('.starrable > .star::after')).toMatch(/z-index:\s*-1/)
    })

    it('is not inside a stacking context of its own, which would hold it above its neighbours', () => {
      // Held back, a star is dimmed: an opacity on the button did that, and the area went over the inputs.
      const buttons = plan.filter((r) => /^[^,]*\.star(?![A-Za-z])[^,]*$/.test(r.selector) && !/svg|::/.test(r.selector))
      expect(buttons.length).toBeGreaterThan(3)
      for (const { selector, body: declarations } of buttons) {
        expect(declarations, selector).not.toMatch(/(^|[;\s])(opacity|transform|filter|will-change|z-index|isolation|contain|mix-blend-mode)\s*:/)
      }
      expect(body('.star:disabled svg')).toMatch(/opacity:\s*0\.6/)
    })

    it('lets the slider of a lever on the row above stay above the star of one on the row below', () => {
      expect(block('pointer: coarse')).toMatch(/\.leverTrack\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*1/)
    })

    it('has no slider reaching into the gutter it hangs in', () => {
      expect(body(".columns input[type='range']")).toMatch(/margin-inline:\s*0/)
    })
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

/** What a stylesheet says under one media query: the rules inside every block of it, and the sheet without them. */
function underQuery(file: string, query: string): { inside: { selector: string; body: string }[]; outside: string } {
  const css = stylesheet(file)
  const block = new RegExp(`@media ${query.replace(/[()]/g, '\\$&')} \\{([\\s\\S]*?)\\n\\}`, 'g')
  const inside = [...css.matchAll(block)].flatMap((m) =>
    [...(m[1] ?? '').matchAll(/([^{};]+)\{([^{}]*)\}/g)].map((r) => ({ selector: (r[1] ?? '').trim(), body: r[2] ?? '' })),
  )
  return { inside, outside: css.replace(block, '') }
}

const COARSE_WIDE = '(pointer: coarse) and (min-width: 900px)'

describe('the inputs panel on a touch screen', () => {
  const goals = underQuery('tabs/goals/goals.module.css', COARSE_WIDE)
  const rule = (selector: string) => goals.inside.find((r) => r.selector === selector)?.body ?? ''

  it('takes the steppers and the amount fields to 44px, for a coarse pointer on the wide layout only', () => {
    expect(rule('.stack')).toMatch(/--stepper-size:\s*2\.75rem/)
    expect(rule('.stack .valueInput')).toMatch(/min-height:\s*2\.75rem/)
    // Set nowhere else, so the phone's steppers and the ones in Settings keep their size.
    expect(goals.outside).not.toMatch(/--stepper-size\s*:/)
  })

  it('leaves the stepper at the size it has where nothing sets one', () => {
    const stepper = rules('components/PercentStepper.module.css')
    const button = stepper.find((r) => r.selector === '.btn')?.body

    expect(button).toMatch(/width:\s*var\(--stepper-size,\s*1\.6rem\)/)
    expect(button).toMatch(/height:\s*var\(--stepper-size,\s*1\.6rem\)/)
    expect(stepper.find((r) => r.selector === '.wrap')?.body).toMatch(/gap:\s*var\(--stepper-gap,\s*0\.25rem\)/)
  })

  it('keeps a stepper narrow enough to end inside its column, where the next column\'s star hangs', () => {
    // 133px with the 8px gap and a 75px word is the 216px the narrowest column is; the 141px it was reached 9px past.
    expect(rule('.stack')).toMatch(/--stepper-input-width:\s*2\.5rem/)
    expect(rule('.stack .fieldRow')).toMatch(/gap:\s*0\.5rem/)
  })

  it("keeps a row's label and the star beside it on one line whether the label wraps or not", () => {
    // The label starts a fixed distance down, and the star is on the middle of the row's first 44px.
    expect(rule('.stack .fieldRow')).toMatch(/align-items:\s*flex-start/)
    const star = underQuery('tabs/goals/desktop/planDesktop.module.css', '(pointer: coarse)').inside.find(
      (r) => r.selector === '.starrable > .star',
    )
    expect(star?.body).toMatch(/top:\s*0\.825rem/)
  })

  it('takes the life event buttons, the sign labels and the help line to 44px', () => {
    const selectors = ['.stack .addLifeEventBtn', '.stack .lifeEventCancelBtn', '.stack .lifeEventSignLabel', '.stack .controlSummary']
    const sized = goals.inside.find((r) => selectors.every((s) => r.selector.includes(s)))

    expect(sized?.body).toMatch(/min-height:\s*2\.75rem/)
    expect(rule('.stack .lifeEventRemove')).toMatch(/min-width:\s*2\.75rem/)
    expect(rule('.stack .lifeEventEdit')).toMatch(/min-width:\s*2\.75rem/)
    expect(goals.outside).not.toMatch(/lifeEventRemove[^}]*min-height:\s*2\.75rem/)
    expect(goals.outside).not.toMatch(/lifeEventEdit[^}]*min-height:\s*2\.75rem/)
  })
})

describe('the sliders and the bar levers on a touch screen', () => {
  const goals = underQuery('tabs/goals/goals.module.css', COARSE_WIDE)
  const plan = underQuery('tabs/goals/desktop/planDesktop.module.css', '(pointer: coarse)')
  const planRule = (selector: string) => plan.inside.find((r) => r.selector === selector)?.body ?? ''

  it('gives a slider a 44px box that takes back 16px of it as margin, so it adds 11px and not 27px', () => {
    const range = goals.inside.find((r) => r.selector === '.stack .range')?.body

    expect(range).toMatch(/height:\s*2\.75rem/)
    expect(range).toMatch(/margin-block:\s*-0\.5rem/)
    expect(goals.outside).not.toMatch(/\.range\s*\{[^}]*height/)
  })

  it('makes the whole row of a lever 44px, over the slider box that reaches up into it', () => {
    expect(planRule('.leverValue')).toMatch(/min-height:\s*2\.75rem/)
    // Above the slider's box (and the track, which is at 1), so a press on the lower part of the digits is theirs.
    expect(planRule('.leverValue')).toMatch(/z-index:\s*2/)
    expect(planRule('.leverTrack')).toMatch(/height:\s*1\.75rem/)
    expect(plan.outside).toMatch(/\.leverTrack\s*\{[^}]*height:\s*1\.25rem/)
  })
})

describe('the scenario menu on a touch screen', () => {
  const plan = underQuery('tabs/goals/desktop/planDesktop.module.css', '(pointer: coarse)')
  const rule = (selector: string) => plan.inside.find((r) => r.selector === selector)?.body ?? ''

  it('has 44px rows and name field, and swatches 28px apart from each other with a 36 by 44 tap area', () => {
    expect(rule('.menuItem')).toMatch(/min-height:\s*2\.75rem/)
    expect(rule('.menuInput,\n  .menuBtn')).toMatch(/min-height:\s*2\.75rem/)
    expect(rule('.menu')).toMatch(/--swatch-size:\s*1\.75rem/)
    expect(rule('.menu')).toMatch(/--swatch-hit:\s*-0\.625rem -0\.375rem/)
    // Nine swatches, 28px and 8px apart, are 316px: the menu is wide enough to keep them in one row.
    expect(rule('.menu')).toMatch(/width:\s*min\(21\.5rem/)
  })

  it('leaves the swatch the size it has for the pickers that set nothing', () => {
    const swatch = rules('components/ColorSwatchPicker.module.css')
    const body = swatch.find((r) => r.selector === '.colorSwatch')?.body

    expect(body).toMatch(/width:\s*var\(--swatch-size,\s*1\.25rem\)/)
    expect(swatch.find((r) => r.selector === '.colorSwatch::after')?.body).toMatch(/inset:\s*var\(--swatch-hit,\s*0\)/)
    expect(swatch.find((r) => r.selector === '.colorPicker')?.body).toMatch(/gap:\s*var\(--swatch-gap,\s*0\.3rem\)/)
  })

  it('sets the sizes under a coarse pointer only', () => {
    expect(plan.outside).not.toMatch(/--swatch-size\s*:/)
  })

  it('takes the buttons of the scenario row and Reset to defaults to 44px, in a row that is already that tall', () => {
    expect(rule('.actions button,\n  .starNote button')).toMatch(/min-height:\s*2\.75rem/)
    expect(rule('.starNote')).toMatch(/min-height:\s*2\.75rem/)
    expect(plan.outside).toMatch(/\.starNote\s*\{[^}]*min-height:\s*1\.925rem/)
  })
})

describe('the legend chips on a touch screen', () => {
  const legend = underQuery('charts/LiveLegend.module.css', COARSE_WIDE)

  it('reach 0.625rem past their padding edge above and below, so the chip is not made taller', () => {
    const reach = legend.inside.find((r) => r.selector === '.chips .rowButton::after')

    expect(reach?.body).toMatch(/position:\s*absolute/)
    expect(reach?.body).toMatch(/inset:\s*-0\.625rem -0\.25rem/)
    // Under a fine pointer, and for the rows layout the phone has, nothing is added.
    expect(legend.outside).not.toMatch(/rowButton::after/)
  })
})

describe('the levers bar where it is held to the bottom edge', () => {
  const held = underQuery('tabs/goals/desktop/planDesktop.module.css', '(min-width: 75rem) and (min-height: 50rem)')
  const grid = held.inside.find((r) => r.selector === '.leverGrid')?.body ?? ''

  it('lays its levers out in one row, however wide the result beside them gets, so it cannot grow over the legend', () => {
    expect(grid).toMatch(/grid-auto-flow:\s*column/)
    expect(grid).toMatch(/grid-auto-columns:\s*minmax\(0,\s*1fr\)/)
    expect(grid).toMatch(/grid-template-columns:\s*none/)
    // The wrapping grid is what narrower screens, where the bar goes by with the page, keep.
    expect(held.outside).toMatch(/\.leverGrid\s*\{[^}]*repeat\(auto-fit/)
  })

  it('clips a result figure that is wider than its column, instead of taking the levers\' room', () => {
    expect(held.outside).toMatch(/\.leverSide\s*\{[^}]*max-width:\s*15rem/)
    expect(held.outside).toMatch(/\.leverResult\s*\{[^}]*text-overflow:\s*ellipsis/)
  })

  it('lets the label of a percentage or number stepper shrink, so that its row is never wider than its column', () => {
    const all = rules('tabs/goals/goals.module.css')
    const label = all.find((r) => r.selector === '.fieldRowStepper > .fieldLabel')?.body ?? ''

    expect(label).toMatch(/min-width:\s*0/)
    expect(label).toMatch(/overflow-wrap:\s*anywhere/)
  })
})
