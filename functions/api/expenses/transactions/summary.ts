import type { Env, ExpensesData } from '../../../_shared/env'
import { summarizeTransactions } from '../../../domain/application/transactionQueryService'
import { ValidationError } from '../../../domain/application/validationError'
import { readOwnerRevision } from '../../../_shared/dbRevision'
import { json } from '../../../_shared/http'
import { mapAppError } from '../../../_shared/mapAppError'
import { parseTransactionQuery } from '../../../_shared/transactionQueryParams'

/**
 * Count (capped) and net spend for the filter fields; paging parameters are not accepted. The body
 * starts with `revision`, the owner's token read before the count: a bulk edit on this filter names
 * it as `expectedRevision`, and is refused if anything was written since. Not cached, and not allowed to be: the
 * answer follows every write.
 */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const { repo, owner } = context.data
  try {
    const { filter, limit, cursor } = parseTransactionQuery(new URL(context.request.url))
    if (limit !== undefined || cursor !== undefined) {
      throw new ValidationError('limit and cursor belong to the list, not the summary')
    }
    const { token } = await readOwnerRevision(context.env.DB, owner)
    const response = json({ revision: token, ...(await summarizeTransactions(repo, owner, filter)) })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) {
    mapAppError(error)
  }
}
