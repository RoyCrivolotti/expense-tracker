/**
 * Replays the capture-to-recurring match over a real ledger, to measure a change to its rules before it merges.
 * Every row logged since a start date is treated as a push that carries only its amount, date and account, and is
 * matched against the series built from the rows before it. The report says how often the match named the right
 * series, offered a choice, named a wrong one, missed, or raised a hint on a row that belongs to no series.
 *
 *   SERIES_MATCH_REPLAY_DIR=/path/outside/the/repo \
 *     node_modules/.bin/tsx scripts/replay-series-match.ts [from-date]
 *
 * The folder holds `transactions.json`: an array of rows with date, description, account, category, type and amount
 * (camelCase or the database's snake_case). The report, which names descriptions, is written next to it as
 * `series-match-replay.txt`; only the counts are printed. There is no default folder, and a folder inside this
 * repository is refused, so real data never lands in it.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { type PushToMatch, type SeriesHint, matchPushesToSeries } from '../src/domain/capture/seriesMatch'
import { daysBetween } from '../src/domain/engine/dates'
import {
  countsAsOccurrence,
  groupKeyString,
  groupTransactions,
  occurrenceKey,
} from '../src/domain/engine/recurringDetect'
import { monthlySeriesOf } from '../src/domain/engine/recurringUpcoming'
import type { Transaction, TxnType } from '../src/domain/types'
import { rowDirection } from '../src/domain/capture/duplicate'

const dir = process.env.SERIES_MATCH_REPLAY_DIR
if (!dir) throw new Error('Set SERIES_MATCH_REPLAY_DIR to the folder holding transactions.json')
const repo = path.resolve(import.meta.dirname, '..')
const folder = path.resolve(dir)
if (folder === repo || folder.startsWith(repo + path.sep)) {
  throw new Error('SERIES_MATCH_REPLAY_DIR must be outside the repository')
}
const from = process.argv[2] ?? '0000-01-01'

type Raw = Record<string, string | number | boolean | null | undefined>
const field = (
  r: Raw,
  camel: string,
  snake: string,
) => r[camel] ?? r[snake]

function rowOf(r: Raw): Transaction {
  const planId = field(r, 'planId', 'plan_id')
  return {
    id: Number(r.id),
    date: String(r.date),
    budgetMonth: String(field(r, 'budgetMonth', 'budget_month') ?? String(r.date).slice(0, 7)),
    description: String(r.description ?? ''),
    accountId: Number(field(r, 'accountId', 'account_id')),
    categoryId: Number(field(r, 'categoryId', 'category_id')),
    type: String(r.type) as TxnType,
    amountCents: Number(field(r, 'amountCents', 'amount_cents')),
    cancelled: Boolean(r.cancelled),
    status: 'posted',
    ...(planId == null ? {} : { planId: Number(planId) }),
  }
}

const rows = (JSON.parse(readFileSync(path.join(folder, 'transactions.json'), 'utf8')) as Raw[])
  .map(rowOf)
  .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)

const counts = {
  inSeries: 0,
  right: 0,
  rightAmongChoice: 0,
  wrong: 0,
  missed: 0,
  other: 0,
  falseOne: 0,
  falseChoice: 0,
}
const byKind: Record<SeriesHint['kind'], number> = { none: 0, series: 0, choose: 0, moved: 0, renamed: 0 }
const detail: string[] = []

for (const row of rows) {
  if (row.date < from || !countsAsOccurrence(row)) continue
  const prior = rows.filter((r) => r.date < row.date)
  const key = occurrenceKey(row)
  const own = groupTransactions(prior).find((g) => groupKeyString(g.key) === key)
  // The row is the next charge of a monthly series when that series exists and its newest charge is two weeks back.
  const ownSeries = own && monthlySeriesOf(own)
  const isNext =
    ownSeries != null && daysBetween(ownSeries.dates[ownSeries.dates.length - 1] ?? row.date, row.date) >= 15

  const push: PushToMatch = {
    id: String(row.id),
    createdAt: row.date,
    localDate: row.date,
    amountCents: Math.abs(row.amountCents),
    currency: 'EUR',
    suggestedType: rowDirection(row.type, row.amountCents) === 'in' ? 'income' : 'expense',
    accountId: row.accountId,
    votedDescription: null,
  }
  const hint = matchPushesToSeries([push], prior).get(push.id)!
  byKind[hint.kind]++
  const names = hint.kind === 'none' ? [] : hint.kind === 'choose' ? hint.series : [hint.series]
  const label = `${row.date} ${row.description} ${row.amountCents}`
  const said = names.map((s) => `${s.description} ${s.amountCents}`).join(' / ')

  if (isNext) {
    counts.inSeries++
    const hasRight = names.some((s) => s.seriesKey === key)
    if (hasRight && names.length === 1) counts.right++
    else if (hasRight) {
      counts.rightAmongChoice++
      detail.push(`CHOICE ${label} -> ${said}`)
    } else if (names.length > 0) {
      counts.wrong++
      detail.push(`WRONG ${label} -> ${said}`)
    } else {
      counts.missed++
      detail.push(`MISSED ${label} (series ${ownSeries.group.amountCents})`)
    }
  } else {
    counts.other++
    if (names.length === 1) {
      counts.falseOne++
      detail.push(`FALSE ${label} -> ${said}`)
    } else if (names.length > 1) counts.falseChoice++
  }
}

const summary = [
  `rows replayed from ${from}: ${counts.inSeries + counts.other}`,
  `next charge of a monthly series: ${counts.inSeries}`,
  `  right: ${counts.right}, right among a choice: ${counts.rightAmongChoice}, wrong: ${counts.wrong}, missed: ${counts.missed}`,
  `other rows: ${counts.other}`,
  `  hint naming one series: ${counts.falseOne}, choice: ${counts.falseChoice}`,
  `hints by kind: ${JSON.stringify(byKind)}`,
]
const out = path.join(folder, 'series-match-replay.txt')
writeFileSync(out, [...summary, '', ...detail].join('\n') + '\n')
process.stdout.write(summary.join('\n') + `\nDetail written to ${out}\n`)
