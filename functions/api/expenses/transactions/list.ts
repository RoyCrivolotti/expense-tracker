import type { Env, ExpensesData } from '../../../_shared/env'
import { listTransactions } from '../../../domain/application/transactionQueryService'
import { json } from '../../../_shared/http'
import { mapAppError } from '../../../_shared/mapAppError'
import { parseTransactionQuery } from '../../../_shared/transactionQueryParams'

/** Keyset pages of the owner's transactions: `?limit=&cursor=` plus the filter fields. */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const { repo, owner } = context.data
  try {
    const { filter, limit, cursor } = parseTransactionQuery(new URL(context.request.url))
    return json(await listTransactions(repo, owner, { filter, limit, cursor }))
  } catch (error) {
    mapAppError(error)
  }
}
