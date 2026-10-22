#!/usr/bin/env node
/**
 * Fail verify when a doc under docs/ passes LIMIT lines without a listed reason, so a doc that grew one
 * PR at a time gets split or trimmed instead of reaching a thousand lines. A listed doc that is back
 * under the limit, or no longer exists, fails too, so the list cannot go stale.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

export const LIMIT = 300

/**
 * Docs allowed past the limit, each with the reason. Prefer splitting a doc to adding one here.
 * @type {Record<string, string>}
 */
export const EXCEPTIONS = {
  'docs/CHANGELOG.md': 'An append-only record of product changes, read by date and never as one document.',
}

/** The Markdown files under `dir`, as paths relative to `root`. */
export function markdownFiles(root, dir = join(root, 'docs')) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return markdownFiles(root, path)
    return entry.name.endsWith('.md') ? [relative(root, path)] : []
  })
}

/**
 * What is wrong with `sizes`, a map of doc path to line count. Empty when nothing is.
 * @param {Record<string, number>} sizes
 * @param {number} [limit]
 * @param {Record<string, string>} [exceptions]
 * @returns {string[]}
 */
export function sizeProblems(sizes, limit = LIMIT, exceptions = EXCEPTIONS) {
  const problems = []
  for (const [file, lines] of Object.entries(sizes)) {
    if (lines > limit && !(file in exceptions)) {
      problems.push(`${file} is ${lines} lines, over the limit of ${limit}. Split or trim it, or list it in EXCEPTIONS with a reason.`)
    }
  }
  for (const [file, reason] of Object.entries(exceptions)) {
    if (!reason.trim()) problems.push(`${file} is listed in EXCEPTIONS without a reason.`)
    if (!(file in sizes)) problems.push(`${file} is listed in EXCEPTIONS but does not exist. Remove it from the list.`)
    else if (sizes[file] <= limit) problems.push(`${file} is ${sizes[file]} lines, within the limit of ${limit}. Remove it from EXCEPTIONS.`)
  }
  return problems
}

/** Line counts of every doc under `root`/docs, by path relative to `root`. */
export function docSizes(root) {
  return Object.fromEntries(
    markdownFiles(root).map((file) => [file, readFileSync(join(root, file), 'utf8').split('\n').length - 1]),
  )
}

function main() {
  const sizes = docSizes(join(import.meta.dirname, '..'))
  const problems = sizeProblems(sizes)
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem)
    process.exit(1)
  }
  console.log(`docs size OK (${Object.keys(sizes).length} files, limit ${LIMIT} lines)`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
