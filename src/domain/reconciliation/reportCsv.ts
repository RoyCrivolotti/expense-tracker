import type { DateDiffLine, ReconciliationReport } from './types'

function esc(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

const HEADER =
  'txn_id,description,category,account,budget_month,app_date,bank_date,delta_days,amount_cents,bank_amount_cents,bank_description,bank_source,coverage_tier,confidence,suspected_placeholder,proposed_date,match_count,review_action'

function lineToCsv(l: DateDiffLine): string {
  return [
    l.txnId,
    esc(l.description),
    esc(l.category),
    esc(l.account),
    l.budgetMonth,
    l.appDate,
    l.bankDate,
    l.deltaDays,
    l.amountCents,
    l.bankAmountCents,
    esc(l.bankDescription),
    l.bankSource,
    l.coverageTier,
    l.confidence,
    l.suspectedPlaceholder ? 1 : 0,
    l.proposedDate,
    l.matchCount,
    '',
  ].join(',')
}

/** Serialize reconciliation report to CSV for manual review. */
export function reportToCsv(report: ReconciliationReport): string {
  const rows = report.lines.map(lineToCsv)
  return [HEADER, ...rows].join('\n')
}

/** Lines with a proposed date fix, sorted by confidence then delta. */
export function proposedFixes(report: ReconciliationReport): DateDiffLine[] {
  return report.lines
    .filter((l) => l.proposedDate !== '')
    .sort((a, b) => {
      const conf = { high: 0, medium: 1, low: 2 } as const
      const ca = conf[a.confidence as keyof typeof conf] ?? 3
      const cb = conf[b.confidence as keyof typeof conf] ?? 3
      if (ca !== cb) return ca - cb
      return Math.abs(b.deltaDays) - Math.abs(a.deltaDays)
    })
}
