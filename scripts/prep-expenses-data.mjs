#!/usr/bin/env node
/**
 * Copy expenses_v3.csv into content/ for local CSV dev mode.
 * Priority: DOCS_CAPTURE fixture → FINANCIAL_REVIEW_DIR → demo fixture.
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

const demoFixture = join(root, 'fixtures/demo-expenses.csv')
if (process.env.DOCS_CAPTURE === '1') {
  writeFileSync(csvDest, readFileSync(demoFixture, 'utf8'))
  console.log('prep-expenses-data: using fixtures/demo-expenses.csv (DOCS_CAPTURE)')
} else if (existsSync(csvSrc)) {
  writeFileSync(csvDest, readFileSync(csvSrc, 'utf8'))
  console.log('prep-expenses-data: bundled expenses_v3.csv')
} else {
  writeFileSync(csvDest, readFileSync(demoFixture, 'utf8'))
  console.log('prep-expenses-data: using fixtures/demo-expenses.csv')
}
