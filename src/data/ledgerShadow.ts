/**
 * Shadow mode: the ledger read in parts is held to the whole dataset, which is the specification of what a
 * screen must show. Any difference is a bug in the parts, in how they are put together or in how a
 * write was patched in, and is reported rather than shown to anyone.
 */
import { referenceTablesOf } from '../domain/data/ledgerParts'
import { sortedMonths } from '../domain/engine/dates'
import { assembleRows, ledgerMonths } from '../domain/ledger'
import type { ExpenseDataset, Transaction } from '../domain/types'
import { type HeldLedger, ledgerOfHeld } from './ledgerHold'

const MAX_LISTED = 5

/** A row as the parts carry it: label ids ascending and always present. */
const normal = (row: Transaction): Transaction => ({ ...row, labelIds: [...(row.labelIds ?? [])].sort((a, b) => a - b) })

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function rowDifferences(held: HeldLedger, dataset: ExpenseDataset): string[] {
  const mine = new Map(assembleRows(ledgerOfHeld(held)).real.map((row) => [row.id, normal(row)]))
  const theirs = new Map(dataset.transactions.map((row) => [row.id, normal(row)]))
  const missing = [...theirs.keys()].filter((id) => !mine.has(id))
  const extra = [...mine.keys()].filter((id) => !theirs.has(id))
  const changed = [...mine.keys()].filter((id) => theirs.has(id) && !sameJson(mine.get(id), theirs.get(id)))
  const named = (what: string, ids: number[]) =>
    ids.length === 0 ? [] : [`${ids.length} transactions ${what}: ${ids.slice(0, MAX_LISTED).join(', ')}`]
  return [...named('missing from the ledger', missing), ...named('only in the ledger', extra), ...named('that differ', changed)]
}

function receiptCounts(dataset: ExpenseDataset): Record<number, number> {
  const counts: Record<number, number> = {}
  for (const a of dataset.attachments) counts[a.transactionId] = (counts[a.transactionId] ?? 0) + 1
  return counts
}

/**
 * What differs between a ledger held in full and the dataset read at the same time, as sentences; empty when
 * they agree. A ledger that holds only a window cannot be compared row for row, so it reports that and nothing
 * else.
 */
export function shadowDifferences(held: HeldLedger, dataset: ExpenseDataset): string[] {
  if (held.cells !== null) return ['the ledger holds only a window, so it cannot be compared with the whole dataset']
  const out: string[] = []
  const reference = referenceTablesOf(dataset)
  for (const key of Object.keys(reference) as (keyof typeof reference)[]) {
    if (!sameJson(held.reference[key], reference[key])) out.push(`${key} differ`)
  }
  out.push(...rowDifferences(held, dataset))
  const months = sortedMonths(dataset.transactions.map((row) => row.budgetMonth))
  if (!sameJson(ledgerMonths(ledgerOfHeld(held)), months)) out.push('the months with data differ')
  if (!sameJson(held.attachmentCounts, receiptCounts(dataset))) out.push('the receipt counts differ')
  return out
}

/** What a shadow comparison has found on this page, for the console and for a test to read. */
export interface ShadowReport {
  checks: number
  differences: string[]
}

export function reportShadow(differences: readonly string[]): ShadowReport {
  const target = globalThis as typeof globalThis & { __ledgerShadow?: ShadowReport }
  const report = target.__ledgerShadow ?? { checks: 0, differences: [] }
  report.checks += 1
  report.differences = [...differences]
  target.__ledgerShadow = report
  if (differences.length > 0) console.warn('[ledger shadow] the ledger differs from the whole dataset:', ...differences)
  return report
}
