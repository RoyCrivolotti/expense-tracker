#!/usr/bin/env node
/**
 * Pages Functions bundler ignores wrangler alias config (alias: {}).
 * Rewrite @domain/@config imports to paths via functions/domain and functions/config symlinks.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = join(import.meta.dirname, '..')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) {
      walk(abs, out)
    } else if (abs.endsWith('.ts') || abs.endsWith('.tsx')) {
      out.push(abs)
    }
  }
  return out
}

const files = walk(join(root, 'functions'))
const aliasPattern = /(['"])@domain\/([^'"]+)\1/g
const configPattern = /(['"])@config\/([^'"]+)\1/g

for (const abs of files) {
  let src = readFileSync(abs, 'utf8')
  const dir = join(abs, '..')
  const toDomain = (sub) => {
    const target = join(root, 'functions/domain', sub)
    let rel = relative(dir, target)
    if (!rel.startsWith('.')) rel = `./${rel}`
    return `'${rel.replace(/\\/g, '/')}'`
  }
  const toConfig = (sub) => {
    const target = join(root, 'functions/config', sub)
    let rel = relative(dir, target)
    if (!rel.startsWith('.')) rel = `./${rel}`
    return `'${rel.replace(/\\/g, '/')}'`
  }
  const next = src
    .replace(aliasPattern, (_, _q, sub) => toDomain(sub))
    .replace(configPattern, (_, _q, sub) => toConfig(sub))
  if (next !== src) {
    writeFileSync(abs, next)
    console.log('updated', relative(root, abs))
  }
}
