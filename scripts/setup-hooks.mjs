#!/usr/bin/env node
/**
 * Point git at the repo's committed hooks.
 *
 * `.git/hooks` is per-clone and, worse here, per-worktree concerns get confusing fast
 * — this repo routinely has eight worktrees sharing one .git. `core.hooksPath` is a
 * single setting on that shared .git, so enabling it once covers every worktree.
 *
 * Runs from `postinstall`, so a fresh clone gets it without anyone remembering.
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const hooksDir = join(root, '.githooks')

try {
  execFileSync('git', ['rev-parse', '--git-dir'], { cwd: root, stdio: 'ignore' })
} catch {
  process.exit(0) // not a git checkout (CI tarball, vendored copy) — nothing to do
}

if (!existsSync(hooksDir)) process.exit(0)

// git will not run a hook that is not executable, and the bit does not always
// survive a checkout on every filesystem.
for (const hook of ['pre-commit']) {
  const file = join(hooksDir, hook)
  if (existsSync(file)) chmodSync(file, 0o755)
}

execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root })
console.log('setup-hooks: core.hooksPath -> .githooks')
