import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXIT_MS, exitVars, foldDone, motionEnabled, setMotionDisabledForTests } from './motion'

/** A duration token from theme.css, in ms, so the script and the stylesheet cannot drift. */
function token(name: string): number {
  const css = readFileSync(resolve(process.cwd(), 'src/ui/theme.css'), 'utf8')
  const match = new RegExp(`${name}:\\s*(\\d+)ms`).exec(css)
  if (!match?.[1]) throw new Error(`${name} is not defined in theme.css`)
  return Number(match[1])
}

afterEach(() => {
  setMotionDisabledForTests(true)
  vi.unstubAllGlobals()
})

describe('exitVars', () => {
  it('passes the exit time to the CSS while an overlay is leaving', () => {
    expect(exitVars(true, 170)).toEqual({ '--exit-ms': '170ms' })
  })

  it('says nothing while it is not, so the stylesheet keeps its own resting values', () => {
    expect(exitVars(false, 170)).toBeUndefined()
  })
})

describe('motionEnabled', () => {
  it('is off while the suite has switched it off', () => {
    setMotionDisabledForTests(true)
    expect(motionEnabled()).toBe(false)
  })

  it('is on when nothing has asked for less', () => {
    setMotionDisabledForTests(false)
    expect(motionEnabled()).toBe(true)
  })

  it('is off for a viewer who asked for reduced motion, whatever the suite says', () => {
    setMotionDisabledForTests(false)
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-reduced-motion') }))
    expect(motionEnabled()).toBe(false)
  })
})

describe('EXIT_MS', () => {
  it('keeps every exit short, because these play dozens of times a day', () => {
    for (const ms of Object.values(EXIT_MS)) expect(ms).toBeLessThanOrEqual(200)
  })

  it('has a popover leave faster than a sheet, and every exit shorter than the arrival it mirrors', () => {
    expect(EXIT_MS.popover).toBeLessThan(EXIT_MS.sheet)
    expect(EXIT_MS.sheet).toBeLessThan(token('--motion-enter-sheet'))
    expect(EXIT_MS.fade).toBeLessThan(token('--motion-enter-fade'))
    expect(EXIT_MS.popover).toBeLessThan(token('--motion-enter-pop'))
    expect(EXIT_MS.bar).toBeLessThan(token('--motion-enter-sheet'))
  })

  it('folds for exactly as long as the stylesheet does, since the script waits on the CSS', () => {
    expect(EXIT_MS.fold).toBe(token('--motion-fold'))
  })
})

describe('foldDone', () => {
  it('waits out the fold when motion is on, and does not wait when it is off', async () => {
    vi.useFakeTimers()
    try {
      setMotionDisabledForTests(false)
      let settled = false
      void foldDone().then(() => {
        settled = true
      })
      await vi.advanceTimersByTimeAsync(EXIT_MS.fold - 1)
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(settled).toBe(true)

      setMotionDisabledForTests(true)
      let immediate = false
      void foldDone().then(() => {
        immediate = true
      })
      await vi.advanceTimersByTimeAsync(0)
      expect(immediate).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

/** Every component stylesheet, found rather than listed so that a new one is checked too. */
function stylesheets(dir = resolve(process.cwd(), 'src/ui')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) return stylesheets(path)
    return entry.name.endsWith('.module.css') ? [path] : []
  })
}

describe('exit animations in the stylesheets', () => {
  it('take their time from --exit-ms, which the component sets from EXIT_MS, not from a number of their own', () => {
    // A way out written with its own duration would run for that long whatever `Presence`
    // holds the element in the DOM for, and be cut off or left hanging when the two differ.
    const withOwnTime: string[] = []
    for (const file of stylesheets()) {
      for (const [declaration, name] of readFileSync(file, 'utf8').matchAll(/animation:\s*([\w-]+)[^;]*;/g)) {
        if (/(?:-out|Out)$/.test(name ?? '') && !declaration.includes('var(--exit-ms')) {
          withOwnTime.push(`${file.replace(process.cwd() + '/', '')}: ${declaration}`)
        }
      }
    }
    expect(withOwnTime).toEqual([])
  })

  it('finds the exits it is meant to check', () => {
    // Guards the test above against passing because its pattern matched nothing.
    const exits = stylesheets().flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/animation:\s*([\w-]+(?:-out|Out))\b/g)].map((m) => m[1]),
    )
    expect(exits.length).toBeGreaterThanOrEqual(8)
  })
})
