#!/usr/bin/env node
/**
 * Copy expenses_v3.csv from investing-docs for local CSV dev mode.
 * FINANCIAL_REVIEW_DIR defaults to ~/Repos/personal/finance-review.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const contentDir = join(root, 'content')
const srcDir =
  process.env.FINANCIAL_REVIEW_DIR ?? join(homedir(), 'Repos', 'personal', 'finance-review')
const csvSrc = join(srcDir, 'data', 'expenses_v3.csv')
const csvDest = join(contentDir, 'expenses_v3.csv')

mkdirSync(contentDir, { recursive: true })

if (existsSync(csvSrc)) {
  writeFileSync(csvDest, readFileSync(csvSrc, 'utf8'))
  console.log('prep-expenses-data: bundled expenses_v3.csv')
} else {
  writeFileSync(csvDest, '# expenses_v3.csv not found in finance-review/data\n')
  console.warn('prep-expenses-data: CSV not found — using placeholder')
}
