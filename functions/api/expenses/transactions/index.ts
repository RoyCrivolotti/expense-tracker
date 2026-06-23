import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewTransaction } from '../../../domain/data/dataSource'
import { createTransaction } from '../../../domain/application/transactionService'
import { mapAppError } from '../../../_shared/mapAppError'
import { json, readJson } from '../../../_shared/http'

export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const input = await readJson<NewTransaction>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await createTransaction(repo, owner, input), 201)
  } catch (error) {
    mapAppError(error)
  }
}
