// `npm run verify` and .github/workflows/ci.yml list the same checks twice: one command for a
// laptop, parallel jobs for CI. This fails when a check is added to one and not the other.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')

const steps = pkg.scripts.verify.split('&&').map((step) => step.trim())
// CI runs the tests as shards and merges their coverage, so they are not one command there.
const TESTS = 'npm run test:coverage'

describe('ci.yml', () => {
  it.each(steps.filter((step) => step !== TESTS))('runs `%s`, as `npm run verify` does', (step) => {
    expect(ci).toContain(`run: ${step}`)
  })

  it('runs the tests as shards and merges their coverage', () => {
    expect(steps).toContain(TESTS)
    expect(ci).toContain('--shard=')
    expect(ci).toContain('--merge-reports --coverage')
  })
})
