#!/usr/bin/env node
/**
 * Read every committed documentation screenshot and check nothing from the real
 * finance export is legible in it.
 *
 * The pre-commit gate (`check-screenshot-safety.mjs`) stops the mistake being made.
 * This is the sweep that proves it: OCR each image, then look for amounts and words
 * that appear in the real export but not in the demo fixtures. Amounts are the strong
 * signal — exact strings, hundreds of them, and a screenshot rendered from the demo
 * data will not reproduce them.
 *
 * Only ever prints file names and match counts, never the matched values, so running
 * the audit cannot itself put real data anywhere.
 *
 * Needs an OCR engine: macOS Vision (compiled on demand from scripts/ocr-images.swift)
 * or `tesseract` on PATH. Without one it reports that and exits 0 — CI has neither the
 * engine nor the real CSV to compare against, so this is a local tool by design.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const WATCHED = /^(docs\/|\.github\/screenshots\/).*\.(png|jpe?g|gif|webp)$/i

// No default path. A tool that reaches into a private location without being asked is
// the shape of the mistake this whole file exists to catch, and hardcoding one would
// also put someone's directory layout in a public repo. Unset means "nothing to
// compare against", and the audit says so rather than guessing.
const workbookDir = process.env.FINANCIAL_REVIEW_DIR?.trim()
const realCsvPath = workbookDir ? join(workbookDir, 'data/expenses_v3.csv') : null

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
}

/** Compile the Vision helper once and cache it next to the OS temp dir. */
function macOcr() {
  if (process.platform !== 'darwin') return null
  if (spawnSync('which', ['swiftc']).status !== 0) return null
  const src = join(root, 'scripts/ocr-images.swift')
  const cacheDir = join(tmpdir(), 'expense-tracker-ocr')
  mkdirSync(cacheDir, { recursive: true })
  const bin = join(cacheDir, 'ocr-images')
  const stale = !existsSync(bin) || statSync(bin).mtimeMs < statSync(src).mtimeMs
  if (stale) {
    console.log('audit: compiling the Vision OCR helper (first run only)...')
    const built = spawnSync('swiftc', ['-O', '-o', bin, src], { stdio: 'inherit' })
    if (built.status !== 0) return null
  }
  return (listFile) => execFileSync(bin, ['--list', listFile, root], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function tesseractOcr() {
  if (spawnSync('which', ['tesseract']).status !== 0) return null
  return (listFile) =>
    readFileSync(listFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((rel) => {
        const out = spawnSync('tesseract', [join(root, rel), 'stdout'], { encoding: 'utf8' })
        return `${rel}\t${(out.stdout ?? '').replace(/\s+/g, ' ')}`
      })
      .join('\n')
}

const ocr = macOcr() ?? tesseractOcr()
if (!ocr) {
  console.log('audit:screenshots — no OCR engine (needs macOS swiftc, or tesseract on PATH). Skipped.')
  process.exit(0)
}

if (!realCsvPath || !existsSync(realCsvPath)) {
  console.log(
    'audit:screenshots — set FINANCIAL_REVIEW_DIR to a directory holding data/expenses_v3.csv\n' +
      'to compare against. Nothing to check without it. Skipped.',
  )
  process.exit(0)
}

const images = git(['ls-files']).filter((f) => WATCHED.test(f))
if (images.length === 0) {
  console.log('audit:screenshots — no documentation images tracked.')
  process.exit(0)
}

const listFile = join(tmpdir(), `expense-tracker-audit-${process.pid}.txt`)
writeFileSync(listFile, images.join('\n'))
const output = ocr(listFile)

const MONEY = /\d{1,3}(?:\.\d{3})*,\d{2}/g
const words = (t) => new Set(t.toLowerCase().match(/[a-záéíóúñü]{4,}/g) ?? [])
const amounts = (t) => new Set(t.match(MONEY) ?? [])

const real = readFileSync(realCsvPath, 'utf8')
const demo =
  readFileSync(join(root, 'fixtures/demo-expenses.csv'), 'utf8') +
  readFileSync(join(root, 'fixtures/demo-staging-expenses.csv'), 'utf8')

const realAmounts = new Set([...amounts(real)].filter((a) => !amounts(demo).has(a)))
const demoWords = words(demo)
// Source strings are everything the app can legitimately draw, so they cannot count
// as evidence of real data.
const sourceWords = words(
  git(['ls-files', 'src', 'functions'])
    .filter((f) => /\.(ts|tsx|css)$/.test(f))
    .map((f) => readFileSync(join(root, f), 'utf8'))
    .join(' '),
)
const realWords = [...words(real)].filter((w) => !demoWords.has(w) && !sourceWords.has(w))
const realWordSet = new Set(realWords)

const findings = []
let scanned = 0
for (const line of output.split('\n').filter(Boolean)) {
  const tab = line.indexOf('\t')
  const path = line.slice(0, tab).replace(root + '/', '')
  const text = line.slice(tab + 1)
  if (text === 'OCR_ERROR') {
    findings.push({ path, note: 'OCR failed — check by eye' })
    continue
  }
  scanned++
  const amountHits = [...amounts(text)].filter((a) => realAmounts.has(a)).length
  const wordHits = [...words(text)].filter((w) => realWordSet.has(w)).length
  // One stray amount out of hundreds is coincidence; a name plus an amount is not.
  if (amountHits >= 3 || (amountHits >= 1 && wordHits >= 1) || wordHits >= 3) {
    findings.push({ path, amountHits, wordHits })
  }
}

console.log(`audit:screenshots — ${scanned} image(s) read, ${realAmounts.size} real-only amounts to match against\n`)
if (findings.length === 0) {
  console.log('Nothing from the real export is legible in any committed screenshot.')
  process.exit(0)
}

console.error('Possible real data found:\n')
for (const f of findings) {
  console.error(f.note ? `  ${f.path}  (${f.note})` : `  ${f.path}  (${f.amountHits} amount, ${f.wordHits} word matches)`)
}
console.error('\nMatches are a signal, not a verdict — open each one and look before acting.')
process.exit(1)
