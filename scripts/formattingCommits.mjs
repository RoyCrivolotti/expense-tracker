/**
 * Lets the PR gates look past commits that only reformat code.
 *
 * `.git-blame-ignore-revs` names those commits (git blame and GitHub read the same file). Without this, the commit
 * that reformats the repo would make `coverage:diff` demand 90% coverage of every line it touched, and
 * `check:pr-screenshots` demand pictures for every `src/ui` file in it. With it, a line counts as changed by a PR
 * only when a commit outside the list is what last wrote it, so a later PR with real changes is still measured.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const IGNORE_FILE = '.git-blame-ignore-revs'

function git(
  args,
  cwd,
) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 200,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

/** The commit ids named in the text of an ignore file: one per line, `#` starts a comment. */
export function parseIgnoreFile(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/#.*/, '').trim())
    .filter((line) => /^[0-9a-f]{40}$/i.test(line))
    .map((sha) => sha.toLowerCase())
}

/** Whether `sha` is a commit that HEAD contains. A listed id git has not got (a shallow clone) is skipped, not an error. */
function isAncestorOfHead(
  sha,
  cwd,
) {
  try {
    git(['merge-base', '--is-ancestor', sha, 'HEAD'], cwd)
    return true
  } catch {
    return false
  }
}

/** The ignore file as `base` has it, or null when the base has none. */
function ignoreFileAt(
  base,
  cwd,
) {
  try {
    return git(['show', `${base}:${IGNORE_FILE}`], cwd)
  } catch {
    return null
  }
}

/**
 * The formatting commits to look past, as full ids, limited to those this checkout has.
 *
 * The list is read from `base`, the branch the PR is going into, so a PR cannot skip a commit of its own by naming it
 * in the file: only commits that main already trusts count. The head's file is used only when the base has none, which
 * is the one PR that introduces the file.
 */
export function ignoredRevisions(
  base,
  cwd = '.',
) {
  let text = ignoreFileAt(base, cwd)
  if (text === null) {
    const file = path.join(cwd, IGNORE_FILE)
    if (!existsSync(file)) return []
    text = readFileSync(file, 'utf8')
  }
  return parseIgnoreFile(text).filter((sha) => isAncestorOfHead(sha, cwd))
}

/**
 * The 1-based lines of a file that a commit outside `ignored` last wrote, read from `git blame --porcelain` run over
 * `<base>..HEAD`. Lines git blames to the base itself are marked `boundary` and are not the PR's.
 * @param {string} porcelain
 * @param {Set<string>} ignored
 * @returns {Set<number>}
 */
export function linesWrittenByPr(
  porcelain,
  ignored,
) {
  const boundary = new Set()
  const lines = new Map()
  let current = null
  for (const row of porcelain.split('\n')) {
    const header = /^([0-9a-f]{40}) \d+ (\d+)/.exec(row)
    if (header) {
      current = header[1]
      lines.set(Number(header[2]), current)
    } else if (row === 'boundary' && current) {
      boundary.add(current)
    }
  }
  const written = new Set()
  for (const [line, sha] of lines) {
    if (!boundary.has(sha) && !ignored.has(sha)) written.add(line)
  }
  return written
}

/** The lines of `file` that the PR's own commits wrote, skipping the formatting commits in `ignored`. */
export function prLines(
  base,
  file,
  ignored,
  cwd = '.',
) {
  const dir = mkdtempSync(path.join(tmpdir(), 'blame-ignore-'))
  try {
    const list = path.join(dir, 'revs')
    writeFileSync(list, `${ignored.join('\n')}\n`)
    const porcelain = git(['blame', '--porcelain', '--ignore-revs-file', list, `${base}..HEAD`, '--', file], cwd)
    return linesWrittenByPr(porcelain, new Set(ignored))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * The files a commit outside `ignored` touched, among `files` (the PR's net diff). A file that only a formatting
 * commit changed is dropped; a file such a commit and a real one both changed stays.
 */
export function filesTouchedByPr(
  base,
  files,
  ignored,
  cwd = '.',
) {
  const skip = new Set(ignored)
  const commits = git(['rev-list', '--no-merges', `${base}..HEAD`], cwd)
    .split('\n')
    .filter((sha) => sha && !skip.has(sha))
  const touched = new Set()
  for (const sha of commits) {
    for (const file of git(['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', sha], cwd).split('\n')) {
      if (file) touched.add(file)
    }
  }
  return files.filter((file) => touched.has(file))
}
