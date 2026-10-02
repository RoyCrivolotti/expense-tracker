import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** A stylesheet in src/ui, without its comments. */
function stylesheet(file: string): string {
  return readFileSync(resolve(process.cwd(), 'src/ui', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

/** The declarations of the first rule with this selector, wherever it sits (a media query included). */
function declarations(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[{};\\s])${escaped}\\s*\\{([^{}]*)\\}`).exec(css)?.[1] ?? ''
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
})
