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

// CI runs the tests as shards and merges their coverage, so they are not one command there.
const TESTS = 'npm run test:coverage'
// A laptop runs some checks side by side through this script; CI runs each as its own step.
const SIDE_BY_SIDE = 'node scripts/side-by-side.mjs '
// The laptop's lint keeps a cache; CI's must not, so it runs the plain script.
const IN_CI: Record<string, string> = { 'lint:cached': 'lint' }

const steps = pkg.scripts.verify
  .split('&&')
  .map((step) => step.trim())
  .flatMap((step) =>
    step.startsWith(SIDE_BY_SIDE)
      ? step
          .slice(SIDE_BY_SIDE.length)
          .trim()
          .split(/\s+/)
          .map((name) => `npm run ${IN_CI[name] ?? name}`)
      : [step],
  )

describe('ci.yml', () => {
  it.each(steps.filter((step) => step !== TESTS))('runs `%s`, as `npm run verify` does', (step) => {
    expect(ci).toContain(`run: ${step}`)
  })

  it('runs the tests as shards and merges their coverage', () => {
    expect(steps).toContain(TESTS)
    expect(ci).toContain('--shard=')
    expect(ci).toContain('--merge-reports --coverage')
  })

  it('lints without the cache', () => {
    expect(steps).toContain('npm run lint')
    expect(ci).not.toMatch(/lint:cached|lint-cached|--cache/)
  })
})
