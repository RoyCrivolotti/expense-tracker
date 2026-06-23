#!/usr/bin/env tsx
/**
 * Reconcile app transaction dates against Santander debit + Iberia card exports.
 *
 *   FINANCIAL_REVIEW_DIR=~/Repos/personal/finance-review \
 *     npx tsx scripts/reconcile-dates.ts \
 *       --debit ~/Downloads/transactions_….xls \
 *       --iberia-glob "~/Downloads/E_DET_EXTRACTO_PARTICULAR*.xlsx" \
 *       --out reports/date-reconciliation.csv
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseWorkbookCsv } from '../src/domain/data/parseWorkbookCsv'
import { mergeBankLedger } from '../src/domain/reconciliation/mergeBankLedger'
import { reconcileDates } from '../src/domain/reconciliation/matchDates'
import { proposedFixes, reportToCsv } from '../src/domain/reconciliation/reportCsv'

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag)
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null
}

function expandIberiaPaths(argv: { glob: string | null; dir: string | null }): string[] {
  if (argv.dir) {
    const dir = resolve(argv.dir)
    return readdirSync(dir)
      .filter((f) => /^E_DET_EXTRACTO_PARTICULAR.*\.xlsx$/i.test(f))
      .map((f) => resolve(dir, f))
      .sort()
  }
  if (!argv.glob) return []

  const pattern = resolve(argv.glob)
  const dir = dirname(pattern)
  const base = pattern.slice(pattern.lastIndexOf('/') + 1)
  const re = new RegExp(`^${base.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\(/g, '\\(').replace(/\)/g, '\\)')}$`)
  return readdirSync(dir)
    .filter((f) => re.test(f))
    .map((f) => resolve(dir, f))
    .sort()
}

function loadDataset() {
  const dir = process.env.FINANCIAL_REVIEW_DIR
  const csvPath = dir
    ? resolve(dir, 'data/expenses_v3.csv')
    : resolve(ROOT, 'content/expenses_v3.csv')
  const csv = readFileSync(csvPath, 'utf8')
  return parseWorkbookCsv(csv)
}

function main(): void {
  const debitPath = argValue('--debit')
  const iberiaGlob = argValue('--iberia-glob')
  const iberiaDir = argValue('--iberia-dir')
  const outPath = argValue('--out') ?? resolve(ROOT, 'reports/date-reconciliation.csv')

  if (!debitPath) throw new Error('Pass --debit <santander.xls>')

  const debitBuf = new Uint8Array(readFileSync(resolve(debitPath)))
  const iberiaPaths = expandIberiaPaths({ glob: iberiaGlob, dir: iberiaDir })
  const iberiaBufs = iberiaPaths.map((p) => new Uint8Array(readFileSync(p)))

  const bank = mergeBankLedger({ santanderDebit: debitBuf, iberiaStatements: iberiaBufs })
  const dataset = loadDataset()
  const report = reconcileDates(
    dataset.transactions,
    dataset.accounts,
    dataset.categories,
    bank,
  )

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, reportToCsv(report), 'utf8')

  const summaryPath = outPath.replace(/\.csv$/i, '.summary.json')
  writeFileSync(summaryPath, JSON.stringify(report.summary, null, 2), 'utf8')

  const fixesPath = outPath.replace(/\.csv$/i, '.proposed-fixes.csv')
  writeFileSync(fixesPath, reportToCsv({ ...report, lines: proposedFixes(report) }), 'utf8')

  process.stdout.write(`Bank rows: ${bank.length} (${iberiaPaths.length} Iberia files)\n`)
  process.stdout.write(`App txns reconciled: ${report.summary.totalAppTxns}\n`)
  process.stdout.write(`Proposed fixes: ${report.summary.proposedFixes}\n`)
  process.stdout.write(`Unchanged: ${report.summary.unchanged}\n`)
  process.stdout.write(`No match: ${report.summary.noMatch}\n`)
  process.stdout.write(`Out of scope: ${report.summary.outOfScope}\n`)
  process.stdout.write(`Wrote ${outPath}\n`)
  process.stdout.write(`Wrote ${fixesPath}\n`)
  process.stdout.write(`Wrote ${summaryPath}\n`)
}

main()
