import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { docSizes, markdownFiles, sizeProblems } from './check-docs-size.mjs'

const ROOT = join(import.meta.dirname, '..')

describe('sizeProblems', () => {
  it('accepts docs at or under the limit', () => {
    expect(sizeProblems({ 'docs/A.md': 300, 'docs/B.md': 12 }, 300, {})).toEqual([])
  })

  it('names a doc over the limit that is not listed', () => {
    expect(sizeProblems({ 'docs/A.md': 301 }, 300, {})).toEqual([
      'docs/A.md is 301 lines, over the limit of 300. Split or trim it, or list it in EXCEPTIONS with a reason.',
    ])
  })

  it('accepts a listed doc over the limit', () => {
    expect(sizeProblems({ 'docs/A.md': 900 }, 300, { 'docs/A.md': 'append-only' })).toEqual([])
  })

  it('fails a listed doc that is back under the limit, so the list cannot go stale', () => {
    expect(sizeProblems({ 'docs/A.md': 120 }, 300, { 'docs/A.md': 'append-only' })).toEqual([
      'docs/A.md is 120 lines, within the limit of 300. Remove it from EXCEPTIONS.',
    ])
  })

  it('fails a listed doc that no longer exists', () => {
    expect(sizeProblems({}, 300, { 'docs/A.md': 'append-only' })).toEqual([
      'docs/A.md is listed in EXCEPTIONS but does not exist. Remove it from the list.',
    ])
  })

  it('fails a listed doc with no reason', () => {
    expect(sizeProblems({ 'docs/A.md': 900 }, 300, { 'docs/A.md': ' ' })).toEqual([
      'docs/A.md is listed in EXCEPTIONS without a reason.',
    ])
  })
})

describe('the docs in the repo', () => {
  it('find the Markdown files in subfolders too', () => {
    expect(markdownFiles(ROOT)).toEqual(expect.arrayContaining(['docs/README.md', 'docs/decisions/ledger-model.md']))
  })

  it('stay within the limit, or are listed with a reason', () => {
    expect(sizeProblems(docSizes(ROOT))).toEqual([])
  })
})
