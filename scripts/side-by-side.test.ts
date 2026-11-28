import { describe, expect, it } from 'vitest'
import { runSideBySide, summary } from './side-by-side.mjs'

const node = (
  name: string,
  code: string,
) => ({ name, command: process.execPath, args: ['-e', code] })

describe('runSideBySide', () => {
  it('runs every task to the end and names each one that failed', async () => {
    const printed: string[] = []
    const outcomes = await runSideBySide(
      [
        node('format', 'console.log("all formatted")'),
        node('lint', 'console.error("2 problems"); process.exit(1)'),
        node('types', 'setTimeout(() => { console.log("no errors") }, 200)'),
        node('slow fail', 'setTimeout(() => process.exit(2), 300)'),
      ],
      (text) => printed.push(text),
    )
    expect(outcomes.map(({ name, ok }) => [name, ok])).toEqual([
      ['format', true],
      ['lint', false],
      ['types', true],
      ['slow fail', false],
    ])
    expect(summary(outcomes)).toBe('Failed: lint, slow fail')
    const text = printed.join('')
    expect(text).toMatch(/── lint: FAILED in [\d.]+ s\n2 problems/)
    expect(text).toMatch(/── types: passed in [\d.]+ s\nno errors/)
  })

  it('runs them at the same time', async () => {
    // Each task prints when it started and then waits; every one must have started before the
    // first one ended, which one after another could not do.
    const waits = ['a', 'b', 'c'].map((name) => node(name, 'console.log(Date.now()); setTimeout(() => {}, 700)'))
    const ended: number[] = []
    const printed: string[] = []
    await runSideBySide(waits, (text) => {
      if (text.includes('──')) ended.push(Date.now())
      else printed.push(text)
    })
    const started = printed.map(Number)
    expect(started).toHaveLength(3)
    expect(Math.max(...started)).toBeLessThan(Math.min(...ended))
  })

  it('fails a task whose command cannot start', async () => {
    const printed: string[] = []
    const outcomes = await runSideBySide([{ name: 'missing', command: 'no-such-command-here', args: [] }], (text) =>
      printed.push(text),
    )
    expect(summary(outcomes)).toBe('Failed: missing')
    expect(printed.join('')).toContain('ENOENT')
  })

  it('has nothing to report when every task passed', () => {
    expect(summary([{ name: 'a', ok: true, seconds: 1 }])).toBeNull()
  })
})
