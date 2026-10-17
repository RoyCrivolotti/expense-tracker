import type { Env, ExpensesData } from '../../_shared/env'
import { ifNoneMatchMatches } from '../../_shared/datasetEtag'
import { readDatasetEtag } from '../../_shared/dbRevision'
import { json } from '../../_shared/http'

/**
 * `no-cache` lets the browser keep the body but makes it ask first. A 304 costs two rows read and
 * runs neither the installment backfill nor any dataset query: what the backfill depends on is in
 * the ETag (the revision moves with every write, the budget month with the calendar).
 */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const { repo, owner } = context.data
  const etag = await readDatasetEtag(context.env.DB, owner)
  const headers = { ETag: etag, 'Cache-Control': 'private, no-cache' }
  if (ifNoneMatchMatches(context.request.headers.get('if-none-match'), etag)) {
    return new Response(null, { status: 304, headers })
  }
  const response = json(await repo.loadDataset(owner))
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value)
  return response
}
