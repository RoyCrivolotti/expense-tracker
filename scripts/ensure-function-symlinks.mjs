#!/usr/bin/env node
/** Ensure functions/domain and functions/config symlinks exist (Pages bundler has no path aliases). */
import { existsSync, lstatSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')

const links = [
  { path: 'functions/domain', target: '../src/domain' },
  { path: 'functions/config', target: '../config' },
]

for (const { path: linkPath, target } of links) {
  const abs = join(root, linkPath)
  if (existsSync(abs)) {
    const stat = lstatSync(abs)
    if (!stat.isSymbolicLink()) {
      throw new Error(`${linkPath} exists but is not a symlink — remove it and re-run verify`)
    }
    continue
  }
  symlinkSync(target, abs)
  console.log(`created symlink ${linkPath} -> ${target}`)
}
