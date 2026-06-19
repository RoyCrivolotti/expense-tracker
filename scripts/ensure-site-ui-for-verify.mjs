#!/usr/bin/env node
/**
 * Ensure site-ui is a fresh checkout (no nested node_modules) so `tsc -b` matches CI.
 * Skips when site-ui is already a plain directory without node_modules.
 */
import { existsSync, lstatSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SITE_UI = join(ROOT, 'site-ui')
const REF = process.env.SITE_UI_REF ?? 'v1.0.2'
const REPO = 'https://github.com/RoyCrivolotti/site-ui.git'

function needsRefresh() {
  if (!existsSync(SITE_UI)) return true
  if (lstatSync(SITE_UI).isSymbolicLink()) return true
  if (existsSync(join(SITE_UI, 'node_modules'))) return true
  return false
}

function main() {
  if (!needsRefresh()) {
    console.log('site-ui: ok (directory checkout, no nested node_modules)')
    return false
  }
  console.log(`site-ui: refreshing from ${REPO} @ ${REF}`)
  rmSync(SITE_UI, { recursive: true, force: true })
  execSync(`git clone --depth 1 --branch ${REF} ${REPO} site-ui`, {
    cwd: ROOT,
    stdio: 'inherit',
  })
  rmSync(join(SITE_UI, 'node_modules'), { recursive: true, force: true })
  rmSync(join(SITE_UI, '.git'), { recursive: true, force: true })
  console.log('site-ui: ready — run npm install if verify fails on module resolution')
  return true
}

const refreshed = main()
if (refreshed) {
  execSync('npm install --no-workspaces', { cwd: ROOT, stdio: 'inherit' })
}
