#!/usr/bin/env node
/**
 * Upserts the staging preview URL into the PR description, inside a marked
 * block so re-runs (every push to the PR) replace it in place instead of
 * duplicating. The alias URL is stable per branch (see CLAUDE.md > Deploy),
 * so after the first successful run the computed block matches what's
 * already there and this becomes a no-op — it doesn't re-edit the
 * description (and re-fire a `pull_request.edited` event) on every push.
 *
 * Best-effort: the deploy has already succeeded by the time this runs, so a
 * failure here (bad PR number, GitHub API hiccup) is logged as a warning and
 * exits 0 rather than failing the whole deploy-dev workflow over a
 * description edit.
 *
 * Requires the `gh` CLI, authenticated (GH_TOKEN/GITHUB_TOKEN — already set
 * in Actions).
 */
import { execFileSync } from 'node:child_process'

function usageError(message) {
  console.error(`update-pr-staging-url: ${message}`)
  console.error('Usage: node scripts/update-pr-staging-url.mjs --pr <number> --url <staging-url>')
  process.exit(1)
}

const prArgIndex = process.argv.indexOf('--pr')
const pr = prArgIndex !== -1 ? process.argv[prArgIndex + 1] : undefined
const urlArgIndex = process.argv.indexOf('--url')
const url = urlArgIndex !== -1 ? process.argv[urlArgIndex + 1] : undefined
if (!pr) usageError('missing --pr <number>')
if (!url) usageError('missing --url <staging-url>')

const MARKER_START = '<!-- staging-preview:start -->'
const MARKER_END = '<!-- staging-preview:end -->'
const BLOCK_RE = new RegExp(`${MARKER_START}[\\s\\S]*?${MARKER_END}`)

function upsertStagingBlock(body, previewUrl) {
  const block = `${MARKER_START}\n**Staging preview:** ${previewUrl}\n${MARKER_END}`
  if (BLOCK_RE.test(body)) return body.replace(BLOCK_RE, block)
  const trimmed = body.replace(/\s+$/, '')
  return trimmed ? `${trimmed}\n\n${block}\n` : `${block}\n`
}

try {
  const body = execFileSync('gh', ['pr', 'view', pr, '--json', 'body', '-q', '.body'], { encoding: 'utf8' })
  const updated = upsertStagingBlock(body, url)
  if (updated === body) {
    console.log('update-pr-staging-url: description already up to date, nothing to change.')
  } else {
    execFileSync('gh', ['pr', 'edit', pr, '--body-file', '-'], { input: updated, encoding: 'utf8' })
    console.log(`update-pr-staging-url: set staging preview to ${url}`)
  }
} catch (err) {
  console.warn(
    `update-pr-staging-url: could not update the PR description (${err.message}). ` +
      'The deploy itself already succeeded, so this is non-fatal.',
  )
}
