import { countsAsOccurrence, groupKeyString, groupTransactions, occurrenceKey } from '../engine/recurringDetect'
import type { OccurrenceGroup } from '../engine/recurringTypes'
import { monthlySeriesOf } from '../engine/recurringUpcoming'
import { daysBetween } from '../engine/dates'
import type { Transaction, TxnType } from '../types'
import { rowDirection } from './direction'
import { SERIES_MATCH_DAYS } from './seriesWindow'

/** A logged row that may be a monthly charge saved under another name. */
export interface Lookalike {
  transactionId: number
  description: string
  date: string
}

/** A charge the recurring card is waiting for, as `lookalikesOf` needs it. */
export interface AwaitedCharge {
  seriesKey: string
  type: TxnType
  amountCents: number
  /** The usual date the charge is expected on. */
  predictedDate: string
}

/**
 * For each awaited charge, keyed by series, the logged row that may already be it under another name: a payment saved
 * from its bank push with the bank's text, say. The row moves money the same way, its amount equals the charge's to
 * the cent and its date is within `SERIES_MATCH_DAYS` of the usual date, the rule `matchPushesToSeries` holds a push
 * to. A row of any monthly series is that series' charge and is never offered for another, so two series at one price
 * do not claim each other's rows. A row that fits two of the charges is offered for neither, as a push two series fit
 * names neither: one row cannot be both payments. Of several, the nearest in date. Only ever a "maybe" for the person:
 * nothing is hidden by it.
 *
 * `groups` are the series, built from `transactions` when absent; `transactions` are the rows looked through, which in
 * ledger mode is the window, where a charge due this week lives.
 */
export function lookalikesOf(
  charges: readonly AwaitedCharge[],
  transactions: readonly Transaction[],
  groups: readonly OccurrenceGroup[] = groupTransactions([...transactions]),
): Map<string, Lookalike> {
  const seriesKeys = new Set(groups.filter((g) => monthlySeriesOf(g) !== null).map((g) => groupKeyString(g.key)))
  const rows = transactions.filter((t) => countsAsOccurrence(t) && !seriesKeys.has(occurrenceKey(t)))
  const fitsOf = (charge: AwaitedCharge) => {
    const direction = rowDirection(charge.type, charge.amountCents)
    return rows.filter(
      (t) =>
        Math.abs(t.amountCents) === Math.abs(charge.amountCents) &&
        Math.abs(daysBetween(charge.predictedDate, t.date)) <= SERIES_MATCH_DAYS &&
        rowDirection(t.type, t.amountCents) === direction,
    )
  }
  const fits = charges.map((charge) => ({ charge, rows: fitsOf(charge) }))
  const claims = new Map<number, number>()
  for (const { rows: fit } of fits) for (const t of fit) claims.set(t.id, (claims.get(t.id) ?? 0) + 1)
  const found = new Map<string, Lookalike>()
  for (const { charge, rows: fit } of fits) {
    const gapOf = (t: Transaction) => Math.abs(daysBetween(charge.predictedDate, t.date))
    const best = fit
      .filter((t) => claims.get(t.id) === 1)
      .sort((a, b) => gapOf(a) - gapOf(b) || a.date.localeCompare(b.date) || a.id - b.id)[0]
    if (best) found.set(charge.seriesKey, { transactionId: best.id, description: best.description, date: best.date })
  }
  return found
}
