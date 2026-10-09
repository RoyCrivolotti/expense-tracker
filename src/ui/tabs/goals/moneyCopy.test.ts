import { describe, expect, it } from 'vitest'

/**
 * The plan's money has a name, "2026 euros", from the year the plan starts, and the account's money is "on your
 * account". "Today's money" said neither, and meant something different on each screen, so no string that is
 * shown may use it. Comments are free to.
 */
const BANNED = /today(?:'|&apos;|’)s money/i

/** The source with its comments taken out, so that what is left is what can be shown or compared. */
export function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1')
}

describe('withoutComments', () => {
  it('takes out block, JSX and line comments and keeps strings, including ones with slashes', () => {
    const source = [
      "const a = \"today's money\" // not today's money here",
      "const b = 'https://example.com/today' /* today's money */",
      '{/* today&apos;s money */}',
      'text // today’s money',
    ].join('\n')
    const kept = withoutComments(source)
    expect(kept).toContain("const a = \"today's money\"")
    expect(kept).toContain('https://example.com/today')
    expect(kept).not.toContain('not today')
    expect(kept).not.toContain('&apos;s money')
    expect(kept).not.toContain('’s money')
  })
})

describe("no string says today's money", () => {
  const sources = import.meta.glob(['/src/ui/**/*.ts', '/src/ui/**/*.tsx', '/src/domain/**/*.ts', '!/src/**/*.test.*'], {
    query: '?raw',
    import: 'default',
    eager: true,
  })

  it('reads the sources it is meant to guard', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(300)
    expect(Object.keys(sources)).toContain('/src/ui/tabs/goals/planMoneyLabel.ts')
  })

  it('finds none in the app or its domain, comments apart', () => {
    const offenders = Object.entries(sources)
      .filter(([, source]) => BANNED.test(withoutComments(String(source))))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})
