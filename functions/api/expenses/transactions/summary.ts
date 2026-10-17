import type { Env, ExpensesData } from '../../../_shared/env'
import { summarizeTransactions } from '../../../domain/application/transactionQueryService'
import { ValidationError } from '../../../domain/application/validationError'
import { json } from '../../../_shared/http'
import { mapAppError } from '../../../_shared/mapAppError'
import { parseTransactionQuery } from '../../../_shared/transactionQueryParams'

/** Count (capped) and net spend for the filter fields; paging parameters are not accepted. */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const { repo, owner } = context.data
  try {
    const { filter, limit, cursor } = parseTransactionQuery(new URL(context.request.url))
    if (limit !== undefined || cursor !== undefined) {
      throw new ValidationError('limit and cursor belong to the list, not the summary')
    }
    return json(await summarizeTransactions(repo, owner, filter))
  } catch (error) {
    mapAppError(error)
  }
}
