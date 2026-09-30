import type { Env, ExpensesData } from '../../../../_shared/env'
import { setTransactionLabels } from '../../../../domain/application/labelService'
import { mapAppError } from '../../../../_shared/mapAppError'
import { parseNumericId } from '../../../../_shared/params'
import { json, readJson } from '../../../../_shared/http'

/**
 * Replaces a transaction's whole label set. A dedicated route rather than
 * folding into the transaction PATCH: that endpoint's column map is one column
 * per patchable key, and a many-to-many field has no column to map to.
 */
export const onRequestPut: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const transactionId = parseNumericId(context.params, 'id')
  const { labelIds } = await readJson<{ labelIds: unknown }>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await setTransactionLabels(repo, owner, transactionId, labelIds))
  } catch (error) {
    mapAppError(error)
  }
}
