// @vitest-environment node
// What .github/workflows/verify-review-browser.yml promises about when it runs: a pull request and a push to main look
// at the same files, every pattern names something that exists, and the files the checked behaviour lives in are
// among them, the form's lower-case helpers and the scripts the browser check loads included.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')
const workflow = readFileSync(join(ROOT, '.github/workflows/verify-review-browser.yml'), 'utf8')
const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)

/** The path list under one trigger. */
function pathsOf(trigger: string): string[] {
  const block = workflow.slice(workflow.indexOf(`\n  ${trigger}:`))
  const list = /\n {4}paths:\n((?: {6}- '[^']+'\n)+)/.exec(block)?.[1] ?? ''
  return Array.from(list.matchAll(/'([^']+)'/g), (m) => m[1] ?? '')
}

/** A GitHub path filter as a regular expression: `**` crosses folders, `*` does not. */
function patternOf(glob: string): RegExp {
  const part = (text: string) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')
  return new RegExp(`^${glob.split('**').map(part).join('.*')}$`)
}

const covered = (file: string) => pathsOf('pull_request').some((glob) => patternOf(glob).test(file))

describe('verify-review-browser.yml', () => {
  it('runs for the same files on a pull request and on a push to main', () => {
    expect(pathsOf('pull_request').length).toBeGreaterThan(10)
    expect(pathsOf('push')).toEqual(pathsOf('pull_request'))
  })

  it('names nothing that does not exist', () => {
    for (const glob of pathsOf('pull_request')) {
      expect(
        files.some((file) => patternOf(glob).test(file)),
        glob,
      ).toBe(true)
    }
  })

  it('runs when the browser check or a script it loads changes, and when the workflow itself does', () => {
    const checks = ['scripts/verify-review-card.mjs', 'scripts/verify-review-return.mjs']
    const loaded = checks.flatMap((check) =>
      Array.from(
        readFileSync(join(ROOT, check), 'utf8').matchAll(/from '\.\/([\w-]+\.mjs)'/g),
        (m) => `scripts/${m[1]}`,
      ),
    )
    expect(loaded.length).toBeGreaterThan(2)
    for (const file of [...checks, ...loaded, '.github/workflows/verify-review-browser.yml']) {
      expect(covered(file), file).toBe(true)
    }
  })

  it('runs for the form’s helpers whatever their case, the capture rules, the hooks and parts the sheet uses and the API it reads', () => {
    for (const file of [
      'src/ui/components/TransactionModal.tsx',
      'src/ui/components/transactionModalState.ts',
      'src/ui/components/useDuplicateOffer.ts',
      'src/domain/capture/pairs.ts',
      'src/ui/hooks/useFieldReveal.ts',
      'src/ui/hooks/usePinnedFoot.ts',
      'src/ui/components/Presence.tsx',
      'src/ui/components/primitives.tsx',
      'src/ui/components/primitives.module.css',
      'src/ui/components/Money.tsx',
      'src/ui/components/Money.module.css',
      'src/ui/components/SeedNotice.tsx',
      'src/data/recommendationsApi.ts',
      'vite.config.ts',
    ]) {
      expect(files, file).toContain(file)
      expect(covered(file), file).toBe(true)
    }
    expect(covered('src/ui/tabs/goals/GoalsTab.tsx')).toBe(false)
  })
})
