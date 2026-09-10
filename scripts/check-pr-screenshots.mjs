#!/usr/bin/env node
/**
 * Fails CI when a PR touches a UI-facing file but its description carries no
 * visual evidence. See CLAUDE.md > Pull request conventions for the
 * screenshot-placement convention this enforces (commit under
 * docs/pr-screenshots/ and link via raw.githubusercontent.com, since GitHub's
 * API has no endpoint for uploading an image into a PR body directly).
 *
 * Requires the `gh` CLI, authenticated (GH_TOKEN/GITHUB_TOKEN — already set
 * in Actions), and a base ref/sha with enough history to diff against.
 */
import { execFileSync } from 'node:child_process'

const VISUAL_FILE_RE = /^src\/ui\/.*|\.module\.css$/

function usageError(message) {
  console.error(`check-pr-screenshots: ${message}`)
  console.error('Usage: node scripts/check-pr-screenshots.mjs --base <git-ref-or-sha> --pr <number>')
  process.exit(1)
}

const baseArgIndex = process.argv.indexOf('--base')
const base = baseArgIndex !== -1 ? process.argv[baseArgIndex + 1] : undefined
const prArgIndex = process.argv.indexOf('--pr')
const pr = prArgIndex !== -1 ? process.argv[prArgIndex + 1] : undefined
if (!base) usageError('missing --base <git-ref-or-sha>')
if (!pr) usageError('missing --pr <number>')

const changedFiles = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)

const visualFiles = changedFiles.filter((f) => VISUAL_FILE_RE.test(f))
if (visualFiles.length === 0) {
  console.log('check-pr-screenshots: no UI-facing files changed, nothing to require.')
  process.exit(0)
}

const body = execFileSync('gh', ['pr', 'view', pr, '--json', 'body', '-q', '.body'], { encoding: 'utf8' })

// Any markdown image syntax counts — committed docs/pr-screenshots/ evidence
// linked via raw.githubusercontent.com is the documented convention, but a
// pasted GitHub attachment or externally hosted image both satisfy this too.
const HAS_IMAGE_RE = /!\[[^\]]*]\(https?:\/\/[^\s)]+\)/

if (!HAS_IMAGE_RE.test(body)) {
  console.error(
    `check-pr-screenshots: this PR changes ${visualFiles.length} UI-facing file(s) but its ` +
      'description has no image evidence:\n' +
      visualFiles.map((f) => `  - ${f}`).join('\n') +
      '\n\nAdd before/after screenshots — see CLAUDE.md > Pull request conventions for the ' +
      'placement convention (docs/pr-screenshots/<slug>/, linked via raw.githubusercontent.com).',
  )
  process.exit(1)
}

console.log(`check-pr-screenshots OK (${visualFiles.length} UI-facing file(s), image evidence present)`)
