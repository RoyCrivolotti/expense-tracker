// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Pages reads this file from the build; it is not served, so the only way to know it is right is to read it. */
const text = readFileSync(join(import.meta.dirname, '..', '..', 'public', '_headers'), 'utf8')
const rules = text
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'))

describe('public/_headers', () => {
  it('applies one set of headers to every static file', () => {
    expect(rules[0]).toBe('/*')
    expect(rules.slice(1).sort()).toEqual(['Referrer-Policy: same-origin', 'X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY'])
  })

  it('sets no Content-Security-Policy, which has not been soaked with the service worker', () => {
    expect(text.toLowerCase()).not.toMatch(/^\s*content-security-policy/m)
  })

  it('indents every header under its path, as Pages reads it', () => {
    const lines = text.split('\n').filter((line) => line !== '' && !line.startsWith('#'))
    expect(lines[0]).toBe('/*')
    for (const line of lines.slice(1)) expect(line).toMatch(/^ {2}\S/)
  })
})
