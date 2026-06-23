import type { Account, Category, StoredTransaction } from '../types'
import { descriptionScore } from './merchantAliases'
import { daysBetween, monthWindow } from './parseDates'
import type {
  BankSource,
  BankTransaction,
  CoverageTier,
  DateDiffLine,
  MatchConfidence,
  ReconciliationReport,
  ReconciliationSummary,
} from './types'

const IBERIA_CUTOVER = '2025-08-01'
const DEBIT_COVERAGE_FROM = '2024-06-01'
const IBERIA_COVERAGE_FROM = '2025-08-01'

interface MatchCandidate {
  bank: BankTransaction
  score: number
}

interface AppTxnView {
  txn: StoredTransaction
  accountName: string
  categoryName: string
  sources: BankSource[]
  coverageTier: CoverageTier
}

function amountMatches(appCents: number, bankCents: number): boolean {
  if (appCents === bankCents) return true
  const tolerance = Math.max(2, Math.round(appCents * 0.03))
  return Math.abs(appCents - bankCents) <= tolerance
}
function dayOfMonth(iso: string): number {
  return Number(iso.split('-')[2])
}

function isSuspectedPlaceholder(txn: StoredTransaction, all: StoredTransaction[]): boolean {
  if (dayOfMonth(txn.date) !== 1) return false
  const siblings = all.filter(
    (t) =>
      t.id !== txn.id &&
      !t.cancelled &&
      t.description === txn.description &&
      t.accountId === txn.accountId &&
      t.amountCents === txn.amountCents,
  )
  if (siblings.length < 2) return false
  return siblings.every((t) => dayOfMonth(t.date) === 1)
}

function resolveSources(accountName: string, appDate: string): BankSource[] {
  if (accountName === 'Santander Debit') return ['debit_direct']
  if (accountName === 'Iberia Icon') {
    return appDate >= IBERIA_CUTOVER ? ['iberia', 'sc_purchase'] : ['sc_purchase', 'iberia']
  }
  if (accountName === 'Santander Credit') return ['sc_purchase']
  return ['debit_direct', 'sc_purchase', 'iberia']
}

function coverageTier(accountName: string, appDate: string): CoverageTier {
  if (appDate < DEBIT_COVERAGE_FROM) return 'out_of_scope'
  if (accountName === 'Iberia Icon' && appDate < IBERIA_COVERAGE_FROM) return 'heuristic_only'
  return 'reconcilable'
}

function buildViews(
  txns: StoredTransaction[],
  accounts: Account[],
  categories: Category[],
): AppTxnView[] {
  const acctById = new Map(accounts.map((a) => [a.id, a]))
  const catById = new Map(categories.map((c) => [c.id, c.name]))
  return txns
    .filter((t) => !t.cancelled && (t.type === 'expense' || t.type === 'refund'))
    .map((txn) => {
      const accountName = acctById.get(txn.accountId)?.name ?? ''
      return {
        txn,
        accountName,
        categoryName: catById.get(txn.categoryId) ?? '',
        sources: resolveSources(accountName, txn.date),
        coverageTier: coverageTier(accountName, txn.date),
      }
    })
}

function findCandidates(view: AppTxnView, bank: BankTransaction[]): MatchCandidate[] {
  const { from, to } = monthWindow(view.txn.budgetMonth)
  const out: MatchCandidate[] = []

  for (const row of bank) {
    if (!view.sources.includes(row.source)) continue
    if (row.date < from || row.date > to) continue
    if (!amountMatches(view.txn.amountCents, row.amountCents)) continue

    const descScore = descriptionScore(view.txn.description, row.description)
    if (descScore < 0.2) continue

    const dateBonus = 1 - Math.min(Math.abs(daysBetween(view.txn.date, row.date)), 30) / 30
    out.push({ bank: row, score: descScore * 0.8 + dateBonus * 0.2 })
  }
  return out.sort((a, b) => b.score - a.score)
}

function pickConfidence(
  candidates: MatchCandidate[],
  deltaDays: number,
): MatchConfidence {
  if (candidates.length === 0) return 'no_bank_match'
  if (Math.abs(deltaDays) <= 1) return 'unchanged'
  const best = candidates[0]
  if (!best) return 'no_bank_match'
  const second = candidates[1]
  if (best.score >= 0.75 && (!second || best.score - second.score >= 0.15)) return 'high'
  if (best.score >= 0.45) return 'medium'
  return 'low'
}

function bankRowKey(bank: BankTransaction): string {
  return `${bank.source}|${bank.date}|${bank.amountCents}|${bank.description}`
}

function proposedDateFor(confidence: MatchConfidence, delta: number, bankDate: string): string {
  if (confidence !== 'high' && confidence !== 'medium') return ''
  return Math.abs(delta) >= 1 ? bankDate : ''
}

function buildDateDiffLine(
  view: AppTxnView,
  best: MatchCandidate | undefined,
  availableCount: number,
  confidence: MatchConfidence,
  delta: number,
  propose: string,
  allTxns: StoredTransaction[],
): DateDiffLine {
  return {
    txnId: view.txn.id,
    description: view.txn.description,
    category: view.categoryName,
    account: view.accountName,
    budgetMonth: view.txn.budgetMonth,
    appDate: view.txn.date,
    bankDate: best?.bank.date ?? '',
    deltaDays: delta,
    amountCents: view.txn.amountCents,
    bankAmountCents: best?.bank.amountCents ?? 0,
    bankDescription: best?.bank.description ?? '',
    bankSource: best?.bank.source ?? '',
    coverageTier: view.coverageTier,
    confidence,
    suspectedPlaceholder: isSuspectedPlaceholder(view.txn, allTxns),
    proposedDate: propose,
    matchCount: availableCount,
  }
}

function toLine(
  view: AppTxnView,
  candidates: MatchCandidate[],
  usedBank: Set<string>,
  allTxns: StoredTransaction[],
): DateDiffLine {
  const available = candidates.filter((c) => !usedBank.has(bankRowKey(c.bank)))
  const best = available[0]
  const delta = best ? daysBetween(view.txn.date, best.bank.date) : 0
  const baseConfidence = pickConfidence(available, delta)
  const confidence = view.coverageTier === 'out_of_scope' ? 'no_bank_coverage' : baseConfidence
  const propose = proposedDateFor(confidence, delta, best?.bank.date ?? '')

  if (best && Math.abs(delta) >= 1) usedBank.add(bankRowKey(best.bank))

  return buildDateDiffLine(view, best, available.length, confidence, delta, propose, allTxns)
}

function summarize(lines: DateDiffLine[]): ReconciliationSummary {
  return {
    totalAppTxns: lines.length,
    reconcilable: lines.filter((l) => l.coverageTier === 'reconcilable').length,
    proposedFixes: lines.filter((l) => l.proposedDate !== '').length,
    unchanged: lines.filter((l) => l.confidence === 'unchanged').length,
    noMatch: lines.filter((l) => l.confidence === 'no_bank_match').length,
    outOfScope: lines.filter((l) => l.confidence === 'no_bank_coverage').length,
    suspectedPlaceholders: lines.filter((l) => l.suspectedPlaceholder).length,
  }
}

/** Match app transactions to bank ledger and build a date diff report. */
export function reconcileDates(
  txns: StoredTransaction[],
  accounts: Account[],
  categories: Category[],
  bank: BankTransaction[],
): ReconciliationReport {
  const views = buildViews(txns, accounts, categories)
  const usedBank = new Set<string>()
  const lines = views.map((view) => {
    const candidates = findCandidates(view, bank)
    return toLine(view, candidates, usedBank, txns)
  })
  return { lines, summary: summarize(lines) }
}
