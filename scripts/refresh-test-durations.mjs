/**
 * Rewrites scripts/test-durations.json from the test reports of one CI run, which the test shards
 * upload as `vitest-blob-1` to `vitest-blob-4`. GitHub's runners are several times slower than a
 * laptop, and not by the same factor for every file, so the weights come from there:
 *
 *   gh run download <run-id> -p 'vitest-blob-*' -D .tmp/blobs
 *   npm run test:durations -- .tmp/blobs
 *
 * A file's weight is the time its worker spent on it: environment, setup, import and its tests.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'flatted'

const OUT = join(import.meta.dirname, 'test-durations.json')

/**
 * @param {string} dir
 * @returns {string[]}
 */
function blobFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? blobFiles(path) : [path]
  })
}

/**
 * Seconds per test file, keyed by its path from the repository root, sorted by path.
 * @param {unknown[]} blobs parsed blob reports
 * @returns {Record<string, number>}
 */
export function durationsFromBlobs(blobs) {
  /** @type {Record<string, number>} */
  const seconds = {}
  for (const blob of blobs) {
    const files = /** @type {any[]} */ (/** @type {unknown[]} */ (blob)[1])
    for (const file of files) {
      const ms =
        (file.environmentLoad ?? 0) +
        (file.prepareDuration ?? 0) +
        (file.setupDuration ?? 0) +
        (file.collectDuration ?? 0) +
        (file.result?.duration ?? 0)
      seconds[file.name] = Math.round(ms / 100) / 10
    }
  }
  return Object.fromEntries(Object.entries(seconds).sort(([a], [b]) => (a < b ? -1 : 1)))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2]
  if (!dir) {
    console.error('Usage: npm run test:durations -- <folder with the downloaded vitest-blob-* reports>')
    process.exit(1)
  }
  const blobs = blobFiles(dir).map((path) => parse(readFileSync(path, 'utf8')))
  const durations = durationsFromBlobs(blobs)
  const count = Object.keys(durations).length
  if (count === 0) {
    console.error(`No test files found in the reports under ${dir}.`)
    process.exit(1)
  }
  writeFileSync(OUT, `${JSON.stringify(durations, null, 2)}\n`)
  const total = Object.values(durations).reduce((sum, s) => sum + s, 0)
  console.log(`Wrote ${count} files, ${Math.round(total)} s in all, from ${blobs.length} reports to ${OUT}`)
}
