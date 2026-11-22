import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Every source file under `dir`, as a path and its text. */
function sources(dir: string): { path: string; text: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.tsx?$/.test(entry.name) ? [{ path, text: readFileSync(path, 'utf8') }] : []
  })
}

describe('the guide stays out of the code that loads with the app', () => {
  const all = sources('src')

  it('is fetched by a dynamic import, so its chunk is loaded only when the guide is opened', () => {
    const host = all.find((f) => f.path.endsWith('guide/GuideHost.tsx'))!
    expect(host.text).toMatch(/lazy\(\(\) => import\('\.\/GuideSheet'\)\)/)
  })

  it('has its text imported by the sheet alone: any other importer pulls the whole guide into the main chunk', () => {
    const importers = all.filter((f) => !/\.test\.tsx?$/.test(f.path) && /from '[./]*(?:\.\.\/)*guide\/gettingStarted'/.test(f.text)).map((f) => f.path)
    expect(importers).toEqual([join('src', 'ui', 'guide', 'GuideSheet.tsx')])
  })
})
