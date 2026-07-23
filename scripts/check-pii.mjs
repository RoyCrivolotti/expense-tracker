#!/usr/bin/env node
/**
 * Fail verify when a tracked file contains something that looks like real
 * PII — this repo's source is public. See docs/ARCHITECTURE.md for the
 * placeholder + comment convention this enforces.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')

// Binary/generated/vendored files that would only produce noise or false positives.
// This script itself is excluded because it necessarily contains the patterns it checks for.
const SKIP_FILE = [/^package-lock\.json$/, /\.(png|jpg|jpeg|ico|woff2?|ttf)$/i, /^scripts\/check-pii\.mjs$/]

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

// example.com/.org/.net are RFC 2606 reserved for docs. `[a-z].com` covers the
// a@b.com/b@c.com single-letter test-fixture family. git@github.com is the git
// protocol's own address, not personal data. The rest are specific addresses
// this repo intentionally hardcodes (demo account, alert sender) — add new
// ones here, by exact address, with a reason; don't widen the domain match.
const SAFE_EMAIL_RE = new RegExp(
  '^[A-Za-z0-9._%+-]+@(example\\.(com|org|net)|[a-z]\\.com)$' +
    '|^(git@github\\.com|expenses\\.tracker\\.demo@gmail\\.com|expenses-alerts@crivolotti\\.com)$',
  'i',
)

// Literals that have leaked into this public repo's source before (see a past
// internal audit — not linked here since that record is private). Extend this
// list rather than re-litigating what "personal" means each time.
const BANNED_LITERALS = [/Beckham/i, /\bPATH_PRESETS\b/]

function trackedFiles() {
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((file) => !SKIP_FILE.some((pattern) => pattern.test(file)))
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length
}

function scanFile(file) {
  let text
  try {
    text = readFileSync(join(root, file), 'utf8')
  } catch {
    return [] // not valid UTF-8 (binary) — skip
  }

  const failures = []
  for (const match of text.matchAll(EMAIL_RE)) {
    if (!SAFE_EMAIL_RE.test(match[0])) {
      failures.push(`${file}:${lineOf(text, match.index)}: possible real email "${match[0]}"`)
    }
  }
  for (const literal of BANNED_LITERALS) {
    if (literal.test(text)) failures.push(`${file}: contains banned literal matching ${literal}`)
  }
  return failures
}

const files = trackedFiles()
const failures = files.flatMap(scanFile)

if (failures.length > 0) {
  console.error('PII check failed:\n' + failures.join('\n'))
  console.error(
    '\nIf this is a genuinely safe placeholder, add the exact address to SAFE_EMAIL_RE in ' +
      'scripts/check-pii.mjs with a comment explaining why — do not widen the domain match.',
  )
  process.exit(1)
}

console.log(`PII check OK (${files.length} files scanned)`)
