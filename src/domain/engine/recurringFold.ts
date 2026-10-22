/**
 * Series read from the server describe the ledger as it was then. A row written since, which the browser holds
 * because it wrote it, would be in them had they been read now, and the detectors would see it. Folding such rows
 * into the groups gives the groups they would have been, for a row that comes after a series' newest charge
 * (logging this month's bill, which is the write the Upcoming card has to notice at once).
 *
 * Rows that cannot be placed this way are left alone and wait for the next read: one older than a series' newest
 * charge (it moves a gap), one that is edited or deleted, and one that is the third of a series nobody has seen yet.
 */
import type { Transaction } from '../types'
import { budgetOffset, countsAsOccurrence, groupKeyString, occurrenceKey } from './recurringDetect'
import type { OccurrenceGroup } from './recurringTypes'

const byDateThenId = (a: Transaction, b: Transaction): number => a.date.localeCompare(b.date) || a.id - b.id

/** `groups`, each with the rows of `rows` that come after its newest charge added as its newest charges. */
export function foldNewerRows(groups: OccurrenceGroup[], rows: readonly Transaction[]): OccurrenceGroup[] {
  const newest = new Map(groups.map((group) => [groupKeyString(group.key), group.dates[group.dates.length - 1]!]))
  const newer = new Map<string, Transaction[]>()
  for (const row of rows) {
    if (!countsAsOccurrence(row)) continue
    const key = occurrenceKey(row)
    const last = newest.get(key)
    if (last === undefined || row.date <= last) continue
    const list = newer.get(key)
    if (list) list.push(row)
    else newer.set(key, [row])
  }
  if (newer.size === 0) return groups
  return groups.map((group) => {
    const more = newer.get(groupKeyString(group.key))?.sort(byDateThenId)
    const latest = more?.[more.length - 1]
    if (!more || !latest) return group
    return {
      ...group,
      label: latest.description,
      categoryId: latest.categoryId,
      amountCents: latest.amountCents,
      dates: [...group.dates, ...more.map((row) => row.date)],
      budgetMonths: new Set([...group.budgetMonths, ...more.map((row) => row.budgetMonth)]),
      budgetOffsets: [...group.budgetOffsets, ...more.map(budgetOffset)],
    }
  })
}
