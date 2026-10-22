import type { Env, ExpensesData } from '../../../../_shared/env'
import {
  addLabelsToTransactions,
  parseBulkLabelRequest,
} from '../../../../domain/application/bulkEditService'
import { json, readJson } from '../../../../_shared/http'
import { mapAppError } from '../../../../_shared/mapAppError'
import { assertRevisionUnchanged } from '../../../../_shared/revisionPrecondition'

/**
 * Adds labels to many transactions, keeping the labels they already have (the single-row PUT replaces the
 * set). Rows by `{ ids, labelIds }` (up to 500 ids), or by `{ filter, expectedCount, expectedRevision, labelIds }`
 * with the same refusals as a bulk edit on a filter. Answers `{ matched, added }`: the owner's rows reached (an id
 * that is another owner's, or not there, is not counted and gets nothing) and the label links that were new.
 * A label that is not the owner's is a 400. A request is bounded by `MAX_BULK_LABELS` labels and
 * `MAX_BULK_LABEL_LINKS` links in all (rows times labels), because each new link writes a row in the table and in
 * each of its three indexes against the Free plan's daily budget of written rows.
 */
export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const body = await readJson<unknown>(context.request)
  const { repo, owner } = context.data
  try {
    const request = parseBulkLabelRequest(body)
    if (request.expectedRevision !== undefined) assertRevisionUnchanged(context.data, request.expectedRevision)
    return json(await addLabelsToTransactions(repo, owner, request))
  } catch (error) {
    mapAppError(error)
  }
}
