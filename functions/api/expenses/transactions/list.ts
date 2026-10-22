import type { Env, ExpensesData } from '../../../_shared/env'
import { listTransactions } from '../../../domain/application/transactionQueryService'
import { json } from '../../../_shared/http'
import { mapAppError } from '../../../_shared/mapAppError'
import { parseTransactionQuery } from '../../../_shared/transactionQueryParams'

/**
 * Keyset pages of the owner's transactions: `?limit=&cursor=` plus the filter fields. Not cached, and not allowed
 * to be: a page follows every write, and nothing here lets a cache tell that one has happened.
 */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const { repo, owner } = context.data
  try {
    const { filter, limit, cursor } = parseTransactionQuery(new URL(context.request.url))
    const response = json(await listTransactions(repo, owner, { filter, limit, cursor }))
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) {
    mapAppError(error)
  }
}
