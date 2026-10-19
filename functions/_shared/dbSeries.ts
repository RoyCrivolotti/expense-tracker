import type { RecurringSeries } from '../domain/engine/recurringSeries'
import { ensureDescriptionNorm } from './descriptionNormBackfill'
import { SERIES_PARAMS, SERIES_SQL, type SeriesRow } from './seriesSql'
import type { Env } from './env'

/** Day counts as a sorted list. A typed array sorts natively, which matters at a hundred thousand of them. */
function numbers(csv: string | null): number[] {
  if (!csv) return []
  const parts = csv.split(',')
  const sorted = new Float64Array(parts.length)
  for (let i = 0; i < parts.length; i += 1) sorted[i] = Number(parts[i])
  return Array.from(sorted.sort())
}

function toSeries(row: SeriesRow): RecurringSeries {
  return {
    label: row.label,
    accountId: row.account_id,
    categoryId: row.category_id,
    type: row.type,
    amountCents: row.amount_cents,
    newestDates: row.newest_dates.split(',').sort(),
    olderGaps: numbers(row.older_gaps),
    budgetMonths: row.budget_months.split(',').sort(),
    budgetOffsets: numbers(row.offsets),
  }
}

/**
 * Every recurring series of the owner. The statement groups on `description_norm`, so it first makes
 * sure no row is still waiting for one (a bounded chunk of work, see `descriptionNormBackfill.ts`) and
 * answers 503 while some are, rather than leave rows out of a series.
 */
export async function readSeries(env: Env, owner: string): Promise<RecurringSeries[]> {
  await ensureDescriptionNorm(env.DB, owner)
  const { results } = await env.DB.prepare(SERIES_SQL)
    .bind(...SERIES_PARAMS(owner))
    .all<SeriesRow>()
  return (results ?? []).map(toSeries)
}
