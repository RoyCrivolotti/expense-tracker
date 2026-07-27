#!/usr/bin/env node
/**
 * Fails CI if lines added/changed by this PR aren't well covered by tests.
 *
 * The global thresholds in vitest.config.ts are a floor for the whole codebase
 * (much of which predates any coverage requirement); this check is the real
 * enforcement mechanism — it only looks at lines this PR touches, so it can
 * hold new code to a much stricter bar without demanding a rewrite of
 * pre-existing untested UI.
 *
 * Requires `coverage/lcov.info` to already exist (run `npm run test:coverage`
 * first) and a base ref/sha to diff against.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const THRESHOLD = Number(process.env.DIFF_COVERAGE_THRESHOLD ?? 90)
const LCOV_PATH = 'coverage/lcov.info'

function usageError(message) {
  console.error(`check-diff-coverage: ${message}`)
  console.error('Usage: node scripts/check-diff-coverage.mjs --base <git-ref-or-sha>')
  process.exit(1)
}

const baseArgIndex = process.argv.indexOf('--base')
const base = baseArgIndex !== -1 ? process.argv[baseArgIndex + 1] : undefined
if (!base) usageError('missing --base <git-ref-or-sha>')

if (!existsSync(LCOV_PATH)) {
  usageError(`${LCOV_PATH} not found — run \`npm run test:coverage\` first.`)
}

/** @returns {Map<string, Map<number, number>>} absolute file path -> (1-based line -> hit count) */
function parseLcov(text) {
  const files = new Map()
  let current = null
  for (const line of text.split('\n')) {
    if (line.startsWith('SF:')) {
      current = new Map()
      files.set(path.resolve(line.slice(3).trim()), current)
    } else if (line.startsWith('DA:') && current) {
      const [lineNo, hits] = line.slice(3).split(',')
      current.set(Number(lineNo), Number(hits))
    }
  }
  return files
}

/** @returns {Map<string, Set<number>>} absolute file path -> set of added/changed 1-based line numbers */
function parseAddedLines(diffText) {
  const changes = new Map()
  let currentLines = null
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++ ')) {
      const raw = line.slice(4).trim()
      if (raw === '/dev/null') {
        currentLines = null
        continue
      }
      const file = path.resolve(raw.replace(/^b\//, ''))
      currentLines = changes.get(file)
      if (!currentLines) {
        currentLines = new Set()
        changes.set(file, currentLines)
      }
    } else if (line.startsWith('@@') && currentLines) {
      const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line)
      if (!match) continue
      const start = Number(match[1])
      const count = match[2] !== undefined ? Number(match[2]) : 1
      for (let i = 0; i < count; i++) currentLines.add(start + i)
    }
  }
  return changes
}

function isRelevantFile(absPath) {
  if (!/\.(ts|tsx)$/.test(absPath)) return false
  if (absPath.includes('.test.')) return false
  if (absPath.includes(`${path.sep}scripts${path.sep}`)) return false
  return true
}

const coverage = parseLcov(readFileSync(LCOV_PATH, 'utf8'))

const diff = execFileSync(
  'git',
  ['diff', '--unified=0', `${base}...HEAD`, '--', '*.ts', '*.tsx'],
  { encoding: 'utf8', maxBuffer: 1024 * 1024 * 100 },
)
const addedLines = parseAddedLines(diff)

let totalChanged = 0
let totalCovered = 0
const uncoveredByFile = new Map()

for (const [file, lines] of addedLines) {
  if (!isRelevantFile(file)) continue
  const fileCoverage = coverage.get(file)
  if (!fileCoverage) continue // not instrumented (e.g. excluded from coverage.include)
  for (const lineNo of lines) {
    const hits = fileCoverage.get(lineNo)
    if (hits === undefined) continue // not an instrumented statement (blank line, brace, comment)
    totalChanged++
    if (hits > 0) {
      totalCovered++
    } else {
      const rel = path.relative(process.cwd(), file)
      if (!uncoveredByFile.has(rel)) uncoveredByFile.set(rel, [])
      uncoveredByFile.get(rel).push(lineNo)
    }
  }
}

if (totalChanged === 0) {
  console.log('check-diff-coverage: no instrumented lines changed, nothing to check.')
  process.exit(0)
}

const pct = (totalCovered / totalChanged) * 100
console.log(
  `check-diff-coverage: ${totalCovered}/${totalChanged} changed lines covered (${pct.toFixed(1)}%), threshold ${THRESHOLD}%`,
)

if (uncoveredByFile.size > 0) {
  console.log('\nUncovered changed lines:')
  for (const [file, lines] of uncoveredByFile) {
    console.log(`  ${file}: ${lines.join(', ')}`)
  }
}

if (pct < THRESHOLD) {
  console.error(`\ncheck-diff-coverage: ${pct.toFixed(1)}% is below the required ${THRESHOLD}%.`)
  process.exit(1)
}
