#!/usr/bin/env node
/**
 * Refuse to commit screenshots that were taken while real data was on disk.
 *
 * The invariant is deliberately dumb, which is why it holds: **you may not add or
 * change an image under a documentation path while `content/expenses_v3.csv` is
 * anything other than the committed demo fixture.** No OCR, no heuristics, no
 * judgement about what counts as sensitive — just the one condition that was true
 * every time real data reached the repo.
 *
 * `npm run audit:screenshots` is the complementary check: it reads what is actually
 * rendered in the images. Use that for a periodic sweep; this is the gate.
 *
 * Usage:
 *   node scripts/check-screenshot-safety.mjs --staged   (pre-commit hook)
 *   node scripts/check-screenshot-safety.mjs            (working tree vs origin/main)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const contentCsv = join(root, 'content/expenses_v3.csv')
const demoFixture = join(root, 'fixtures/demo-expenses.csv')

/** Paths whose images get published — README gallery and PR evidence. */
const WATCHED = /^(docs\/|\.github\/screenshots\/).*\.(png|jpe?g|gif|webp|avif)$/i

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
}

function changedImages(staged) {
  if (staged) return git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']).filter((f) => WATCHED.test(f))

  // Not a hook run: compare against the upstream default branch, so a branch that
  // added screenshots several commits ago is still checked.
  let base = 'origin/main'
  try {
    git(['rev-parse', '--verify', '--quiet', base])
  } catch {
    base = 'HEAD'
  }
  const committed = git(['diff', '--name-only', '--diff-filter=ACMR', base, 'HEAD'])
  const working = git(['status', '--porcelain']).map((l) => l.slice(3).trim())
  return [...new Set([...committed, ...working])].filter((f) => WATCHED.test(f))
}

const staged = process.argv.includes('--staged')
const images = changedImages(staged)

if (images.length === 0) {
  console.log('screenshot safety OK (no documentation images added or changed)')
  process.exit(0)
}

if (!existsSync(contentCsv)) {
  console.log(`screenshot safety OK (${images.length} image(s) changed; no content/ data present)`)
  process.exit(0)
}

const isDemo = readFileSync(contentCsv, 'utf8') === readFileSync(demoFixture, 'utf8')
if (isDemo) {
  console.log(`screenshot safety OK (${images.length} image(s) changed, content/ is the demo fixture)`)
  process.exit(0)
}

console.error(
  `\nScreenshot safety check FAILED\n\n` +
    `content/expenses_v3.csv is not the demo fixture, so the dev server has been\n` +
    `serving real data — and these images are being committed:\n\n` +
    images.map((f) => `  ${f}`).join('\n') +
    `\n\nPublished screenshots must come from the demo fixture. To fix:\n\n` +
    `  npm run prep:data           # restore the demo fixture\n` +
    `  npm run capture:screenshots # re-take the gallery, or re-take yours by hand\n\n` +
    `Then commit again. If you are certain these images contain no real data,\n` +
    `re-run with SCREENSHOT_CHECK_SKIP=1 — and say why in the commit message.\n`,
)

if (process.env.SCREENSHOT_CHECK_SKIP === '1') {
  console.error('SCREENSHOT_CHECK_SKIP=1 set — allowing against better judgement.\n')
  process.exit(0)
}
process.exit(1)
