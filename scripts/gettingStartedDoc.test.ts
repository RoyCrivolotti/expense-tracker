import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GUIDE_SECTIONS } from '../src/guide/gettingStarted.ts'
import { LIMIT } from './check-docs-size.mjs'
import { DOC_PATH, renderGettingStarted } from './gen-getting-started.ts'

describe('docs/GETTING-STARTED.md', () => {
  it('is what the script writes from the text the app shows, so the two cannot differ', () => {
    // Failing here: run `npm run docs:getting-started` and commit the page, or revert the edit made to it by hand.
    expect(readFileSync(DOC_PATH, 'utf8')).toBe(renderGettingStarted())
  })

  it('carries every section of the guide, in order, with its text', () => {
    const page = renderGettingStarted()
    let at = 0
    for (const section of GUIDE_SECTIONS) {
      const heading = page.indexOf(`## ${section.title}\n`, at)
      expect(heading, section.title).toBeGreaterThanOrEqual(at)
      at = heading
      for (const block of section.blocks) {
        for (const text of block.kind === 'p' ? [block.text] : block.items) expect(page).toContain(text)
      }
    }
    expect(page.indexOf('## Looking around without an account')).toBeGreaterThan(at)
  })

  it('names its audience in its first line and stays inside the docs size limit', () => {
    const page = renderGettingStarted()
    expect(page.split('\n')[0]).toBe('# Getting started guide')
    expect(page.split('\n')[2]).toMatch(/^For users: /)
    expect(page.split('\n').length).toBeLessThanOrEqual(LIMIT)
  })

  it('is listed in the docs index with its audience and linked from the root README', () => {
    expect(readFileSync('docs/README.md', 'utf8')).toMatch(
      /\[GETTING-STARTED\.md\]\(\.\/GETTING-STARTED\.md\) \| User \|/,
    )
    expect(readFileSync('README.md', 'utf8')).toContain('docs/GETTING-STARTED.md')
  })

  it('keeps its section ids and list items unique, since the app uses them as keys', () => {
    expect(new Set(GUIDE_SECTIONS.map((s) => s.id)).size).toBe(GUIDE_SECTIONS.length)
    for (const section of GUIDE_SECTIONS) {
      for (const block of section.blocks) {
        if (block.kind !== 'p') expect(new Set(block.items).size, section.id).toBe(block.items.length)
      }
    }
  })
})
