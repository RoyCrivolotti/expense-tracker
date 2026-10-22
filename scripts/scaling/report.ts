/**
 * Plain-text output for the command line: the plan, the per-route table and the comparison of two runs.
 * Pure, so each is tested as a string.
 */
import type { RouteResult } from '../../functions/_shared/measure/records'
import { CAPS, FREE_PLAN, readPassEstimate, type SeedBudget } from './budget'

const n = (value: number): string => value.toLocaleString('en-US')

export function renderPlan(budget: SeedBudget, largest: { requested: number; budget: SeedBudget }): string[] {
  const { rowsWrittenPerDay: writeLimit, rowsReadPerDay: readLimit } = FREE_PLAN
  return [
    'Free plan, per UTC day and per account (docs/MEASURING.md):',
    `  rows written ${n(writeLimit)}, rows read ${n(readLimit)}, ${FREE_PLAN.queriesPerInvocation} queries per invocation, ${FREE_PLAN.cpuMsPerRequest} ms CPU per request`,
    'This exercise may spend, in total:',
    `  rows written ${n(CAPS.rowsWrittenTotal)} (${n(CAPS.rowsWrittenPerDay)} on any one day), rows read ${n(CAPS.rowsReadTotal)} (${n(CAPS.rowsReadPerDay)} a day)`,
    `  and it stops if the account has written ${n(CAPS.accountWrittenCeiling)} or read ${n(CAPS.accountReadCeiling)} rows today`,
    '',
    `A seed of about ${n(budget.transactions)} transactions:`,
    `  insert ${n(budget.insertWrites)} + reference ${n(budget.referenceWrites)} + write routes ${n(budget.routeWrites)} = day one ${n(budget.dayOne)}`,
    `  delete ${n(budget.deleteWrites)} + reference ${n(budget.referenceWrites)} = day two ${n(budget.dayTwo)}`,
    `  total ${n(budget.total)} rows written: ${budget.fitsTotalCap && budget.fitsDailyCap ? 'within' : 'OVER'} the caps`,
    `  one pass over the read routes reads about ${n(readPassEstimate(budget.transactions))} rows`,
    `The largest seed that fits the total cap is about ${n(largest.requested)} transactions (${n(largest.budget.total)} rows written).`,
  ]
}

const pad = (text: string, width: number): string => text.padEnd(width)

export function renderRoutes(results: readonly RouteResult[]): string[] {
  const head = `${pad('route', 38)} ${'status'.padStart(6)} ${'KB'.padStart(7)} ${'calls'.padStart(5)} ${'stmts'.padStart(5)} ${'read'.padStart(9)} ${'written'.padStart(8)} ${'sql ms'.padStart(8)}`
  const rows = results.map((r) => {
    const s = r.summary
    const flag = r.unexpectedWrite ? '  <- a read wrote' : s.statements > FREE_PLAN.queriesPerInvocation ? '  <- over 50 queries' : s.calls > FREE_PLAN.queriesPerInvocation ? '  <- over 50 calls' : ''
    return `${pad(r.name, 38)} ${String(r.status).padStart(6)} ${(r.bytes / 1024).toFixed(1).padStart(7)} ${String(s.calls).padStart(5)} ${String(s.statements).padStart(5)} ${n(s.rowsRead).padStart(9)} ${n(s.rowsWritten).padStart(8)} ${s.sqlMs.toFixed(1).padStart(8)}${flag}`
  })
  return [head, ...rows]
}

export interface RunFile {
  day: string
  transactions: number
  results: RouteResult[]
}

/** Rows read and written per 1,000 transactions between two runs, and what that makes of 10,000 and 100,000. */
export function compareRuns(small: RunFile, large: RunFile): string[] {
  const span = large.transactions - small.transactions
  if (span <= 0) return ['The second run must hold more transactions than the first.']
  const lines = [`${pad('route', 38)} ${'read /1k'.padStart(9)} ${'at 10k'.padStart(10)} ${'at 100k'.padStart(11)}`]
  for (const after of large.results) {
    const before = small.results.find((r) => r.name === after.name)
    if (!before) continue
    const perThousand = ((after.summary.rowsRead - before.summary.rowsRead) / span) * 1000
    const at = (size: number): number => Math.max(0, Math.round(after.summary.rowsRead + (perThousand * (size - large.transactions)) / 1000))
    lines.push(`${pad(after.name, 38)} ${perThousand.toFixed(0).padStart(9)} ${n(at(10_000)).padStart(10)} ${n(at(100_000)).padStart(11)}`)
  }
  return lines
}
