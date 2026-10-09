import { describe, expect, it } from 'vitest'
import { goalsOnlyChunks } from './bundleGraph.mjs'

type Build = Record<string, string>

const run = (build: Build, indexHtml = '<script type="module" src="/assets/index-a.js"></script><link rel="modulepreload" href="/assets/jsx-1.js">'): string[] =>
  goalsOnlyChunks({
    files: Object.keys(build),
    read: (file: string) => build[file] ?? '',
    indexHtml,
  })

// A build as the bundler writes it: the entry holds the lazy imports of both tabs, each tab imports the entry back,
// and chunks are named after the first module in them.
const base: Build = {
  'index-a.js': 'import"./jsx-1.js";const g=lazy(()=>load(()=>import(`./GoalsTab-b.js`)));const a=lazy(()=>load(()=>import(`./AnalyticsTab-c.js`)))',
  'jsx-1.js': 'export const x=1',
  'GoalsTab-b.js': 'import{a}from"./index-a.js";import{s}from"./ScrollRegion-d.js";import{c}from"./useSvgAnchor-e.js";const Spread=lazy(()=>load(()=>import(`./SpreadChart-f.js`)))',
  'AnalyticsTab-c.js': 'import{a}from"./index-a.js";import{c}from"./useSvgAnchor-e.js"',
  'ScrollRegion-d.js': 'import{a}from"./index-a.js"',
  'useSvgAnchor-e.js': 'export const c=1',
  'SpreadChart-f.js': 'import{s}from"./ScrollRegion-d.js"',
}

describe('goalsOnlyChunks', () => {
  it('finds the Goals chunk, the chunks split out of it and its lazy card, and not what Analytics also loads or what the page loads at once', () => {
    expect(run(base)).toEqual(['GoalsTab-b.js', 'ScrollRegion-d.js', 'SpreadChart-f.js'])
  })

  it('does not walk through the entry, which holds the other tabs\' lazy imports', () => {
    // Goals imports the entry back, and the entry imports every tab lazily. A tab only the entry loads, and that
    // Analytics does not reach, would be counted as Goals' if the walk went through the entry.
    const withSettings = {
      ...base,
      'index-a.js': `${base['index-a.js']};const s=lazy(()=>load(()=>import(\`./SettingsTab-g.js\`)))`,
      'SettingsTab-g.js': 'export const s=1',
    }
    expect(run(withSettings)).not.toContain('SettingsTab-g.js')
    expect(run(withSettings)).not.toContain('AnalyticsTab-c.js')
  })

  it('counts a chunk only Goals loads as Goals\' whatever it is called, and one only Analytics loads as not', () => {
    const renamed = {
      ...base,
      'Chart-9.js': 'export const z=1',
      'Tooltip-8.js': 'export const t=1',
      'GoalsTab-b.js': `${base['GoalsTab-b.js']};import{z}from"./Chart-9.js"`,
      'AnalyticsTab-c.js': `${base['AnalyticsTab-c.js']};import{t}from"./Tooltip-8.js"`,
    }
    expect(run(renamed)).toContain('Chart-9.js')
    expect(run(renamed)).not.toContain('Tooltip-8.js')
  })

  it('leaves out a chunk both tabs load, and one the entry loads statically', () => {
    const both = { ...base, 'AnalyticsTab-c.js': `${base['AnalyticsTab-c.js']};import{s}from"./ScrollRegion-d.js"`, 'index-a.js': `${base['index-a.js']};import"./SpreadChart-f.js"` }
    expect(run(both)).toEqual(['GoalsTab-b.js'])
  })

  it('is nothing when there is no Goals chunk', () => {
    const none: Build = { 'index-a.js': 'export const x=1', 'jsx-1.js': 'export const y=1' }
    expect(run(none)).toEqual([])
  })
})
