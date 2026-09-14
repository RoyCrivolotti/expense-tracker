#!/usr/bin/env node
/**
 * Put the demo fixture in gitignored content/ for local CSV dev mode.
 *
 * **This script has no way to write real data, and that is the point.** It used to
 * prefer the real finance-review export and fall back to the fixture, which meant any
 * run without DOCS_CAPTURE pulled real financial data into the working tree. `npm run
 * verify` calls `build`, which called this — so verify quietly replaced content/ with
 * real data underneath an already-running DOCS_CAPTURE dev server. Screenshots taken
 * after that point looked completely normal and were real; ~48 reached a public repo.
 *
 * Local dev now runs on the demo fixture like everything else. The real export is
 * still read by `scripts/gen-seed-sql.ts`, which needs FINANCIAL_REVIEW_DIR set
 * explicitly and writes its SQL outside the repo.
 *
 * `build` deliberately does not call this. `csvDataSource` imports the CSV with `?raw`,
 * but `resolveSource` only loads that module under `import.meta.env.DEV`, so a
 * production build eliminates the import before resolving it — `vite build` succeeds
 * with no content/ directory at all.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const contentDir = join(root, 'content')

mkdirSync(contentDir, { recursive: true })
writeFileSync(
  join(contentDir, 'expenses_v3.csv'),
  readFileSync(join(root, 'fixtures/demo-expenses.csv'), 'utf8'),
)
console.log('prep-expenses-data: content/expenses_v3.csv <- fixtures/demo-expenses.csv')
