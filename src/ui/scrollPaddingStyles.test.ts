import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PINNED_AIR_PX } from './hooks/stickyScroll'

/** A stylesheet in src/ui, without its comments. */
function stylesheet(file: string): string {
  return readFileSync(resolve(process.cwd(), 'src/ui', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

/** The declarations of the first rule with this selector, wherever it sits (a media query included). */
function declarations(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[{};\\s])${escaped}\\s*\\{([^{}]*)\\}`).exec(css)?.[1] ?? ''
}

/** Every rule with this selector, in file order: a base rule and the one a media query overrides it with. */
function allDeclarations(css: string, selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return Array.from(css.matchAll(new RegExp(`(?:^|[{};\\s])${escaped}\\s*\\{([^{}]*)\\}`, 'g')), (m) => m[1] ?? '')
}

const PX_PER_REM = 16

/**
 * What a CSS length expression comes to, in px: calc(), var() with the custom properties given,
 * env(safe-area-inset-top) and the scroll padding as the numbers a page would have, and rem and
 * px lengths summed and subtracted. All the stylesheets here use is that much.
 */
function lengthPx(expression: string, vars: Record<string, string>, page: { inset: number; pad: number }): number {
  let text = expression
    .replace(/env\(safe-area-inset-top, 0px\)/g, `${page.inset}px`)
    .replace(/var\(--scroll-pad-top, 0px\)/g, `${page.pad}px`)
  for (let i = 0; i < 8 && /var\(--/.test(text); i++) {
    text = text.replace(/var\((--[\w-]+)\)/g, (_, name: string) => `(${vars[name] ?? 'NaN'})`)
  }
  text = text
    .replace(/calc\(/g, '(')
    .replace(/(-?\d*\.?\d+)rem/g, (_, n: string) => `${Number(n) * PX_PER_REM}`)
    .replace(/(-?\d*\.?\d+)px/g, '$1')
  const tokens = text.match(/\d*\.?\d+|[()+-]/g) ?? []
  let at = 0
  const term = (): number => {
    const token = tokens[at++]
    if (token === '-') return -term()
    if (token === '(') {
      const inner = sum()
      at++
      return inner
    }
    return Number(token)
  }
  const sum = (): number => {
    let total = term()
    while (tokens[at] === '+' || tokens[at] === '-') total += tokens[at++] === '+' ? term() : -term()
    return total
  }
  return sum()
}

/** The custom properties a stylesheet declares, name to value. */
function customProperties(css: string): Record<string, string> {
  return Object.fromEntries(Array.from(css.matchAll(/(--[\w-]+):\s*([^;]+);/g), (m) => [m[1] ?? '', m[2] ?? '']))
}

describe('the page scroll padding', () => {
  const theme = stylesheet('theme.css')

  it('starts below the app header and its air, and is also kept as the property that stuck things take back out', () => {
    const html = declarations(theme, 'html')

    expect(html).toMatch(
      /--scroll-pad-top:\s*calc\(var\(--exp-header\) \+ var\(--exp-header-air\) \+ env\(safe-area-inset-top, 0px\)\);/,
    )
    expect(html).toMatch(/scroll-padding-top:\s*var\(--scroll-pad-top\);/)
  })

  it('stops above the bottom bar, the home indicator and the selection bar, where there is a bottom bar', () => {
    const phone = /@media \(max-width: 767px\) \{([\s\S]*?)\n\}/.exec(theme)?.[1] ?? ''

    expect(declarations(phone, 'html')).toMatch(
      /scroll-padding-bottom:\s*calc\(\s*var\(--exp-bottom-bar\) \+ env\(safe-area-inset-bottom, 0px\) \+ var\(--exp-selection-bar, 0px\)/,
    )
    // From 768px the bar is gone (AppShell puts a rail beside the page), and so is its padding.
    expect(declarations(theme, 'html')).not.toMatch(/scroll-padding-bottom/)
    expect(stylesheet('nav/AppShell.module.css')).toMatch(/@media \(min-width: 768px\) \{\s*\.shell/)
  })

  it('is taken back out by the app header and the rail, which are stuck, so focus in them does not scroll the page', () => {
    const shell = stylesheet('nav/AppShell.module.css')

    expect(declarations(shell, '.header *,\n.rail *')).toMatch(
      /scroll-margin-top:\s*calc\(-1 \* var\(--scroll-pad-top, 0px\)\)/,
    )
  })

  it.each([
    ['tabs/tabs.module.css', '.resultBar'],
    ['tabs/goals/goals.module.css', '.contentAnchor'],
    ['tabs/goals/progress.module.css', '.landingTarget'],
  ])('is taken out of the scroll margin of %s %s, which already counts the header, so it lands where it did', (file, selector) => {
    expect(declarations(stylesheet(file), selector)).toMatch(/-\s+var\(--scroll-pad-top, 0px\)/)
  })

  it.each([
    ['tabs/tabs.module.css', '.resultBar *'],
    ['components/TransactionList.module.css', '.dayHeaderRow *,\n.dayHeaderSelect *'],
  ])('is taken back out by what sticks under the header in Transactions, %s %s', (file, selector) => {
    expect(declarations(stylesheet(file), selector)).toMatch(
      /scroll-margin-top:\s*calc\(-1 \* var\(--scroll-pad-top, 0px\)\)/,
    )
  })
})

describe('a jump to the content under a stuck row of tabs', () => {
  const theme = stylesheet('theme.css')
  const goals = stylesheet('tabs/goals/goals.module.css')
  const vars = { ...customProperties(theme), ...customProperties(goals) }
  // The row's bottom edge once stuck, in px, as the sticky `top` and the height give it.
  const rowBottom = (inset: number) =>
    lengthPx('calc(var(--exp-header) + var(--exp-subnav-h) - var(--exp-subnav-tuck) + env(safe-area-inset-top, 0px))', vars, {
      inset,
      pad: 0,
    })

  it('leaves the same air as the page scroll padding does for focus', () => {
    expect(vars['--exp-pinned-air']).toBe(`${PINNED_AIR_PX}px`)
  })

  // The anchors sit in a column that is already scrolled to some padding, which the browser adds
  // to the margin: whatever it is (the row's bottom edge plus air, or Scenarios' pinned chart
  // further down), the content must land the same distance under the row.
  it.each([
    ['components/SectionTabs.module.css', '.anchor', 0],
    ['tabs/goals/goals.module.css', '.contentAnchor', 1],
    ['tabs/goals/progress.module.css', '.landingTarget', 1],
  ])('puts the target of %s %s the air under the row, at any scroll padding or inset', (file, selector, rule) => {
    const margin = /scroll-margin-top:\s*([^;]+);/.exec(allDeclarations(stylesheet(file), selector)[rule] ?? '')?.[1]
    expect(margin).toBeDefined()

    for (const inset of [0, 47]) {
      for (const pad of [60, rowBottom(inset) + PINNED_AIR_PX, 300]) {
        const landing = pad + lengthPx(margin ?? '', vars, { inset, pad })
        expect(landing).toBe(rowBottom(inset) + PINNED_AIR_PX)
      }
    }
  })

  it('does not hang the first hint of an Analytics section out above it, where the bar lands it', () => {
    expect(declarations(stylesheet('analytics/mobile/mobile.module.css'), '.hint:first-child')).toMatch(
      /margin-top:\s*0;/,
    )
  })
})
