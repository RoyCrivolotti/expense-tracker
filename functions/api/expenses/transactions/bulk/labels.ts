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
 * set). Rows by `{ ids, labelIds }`, or by `{ filter, expectedCount, expectedRevision, labelIds }` with the
 * refusals of a bulk edit on a filter. Answers `{ matched, added }`: the owner's rows reached, and the
 * label links that were new.
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
