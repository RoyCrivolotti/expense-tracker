import type { RecurringSeries } from '../domain/engine/recurringSeries'
import { ensureDescriptionNorm } from './descriptionNormBackfill'
import { foldSeries } from './seriesFold'
import { SERIES_SQL, type SeriesTuple } from './seriesSql'
import type { Env } from './env'

/**
 * Every recurring series of the owner. The statement groups on `description_norm`, so it first makes
 * sure no row is still waiting for one (a bounded chunk of work, see `descriptionNormBackfill.ts`) and
 * answers 503 while some are, rather than leave rows out of a series. The rows come back as bare tuples,
 * which is cheaper for the Worker than an object each.
 */
export async function readSeries(env: Env, owner: string): Promise<RecurringSeries[]> {
  await ensureDescriptionNorm(env.DB, owner)
  const rows = await env.DB.prepare(SERIES_SQL).bind(owner).raw<SeriesTuple>()
  return foldSeries(rows)
}
