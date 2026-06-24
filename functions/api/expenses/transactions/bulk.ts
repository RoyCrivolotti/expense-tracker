import type { Env, ExpensesData } from '../../../_shared/env'
import {
  bulkCreateTransactions,
  bulkDeleteTransactions,
} from '../../../domain/application/transactionService'
import { mapAppError } from '../../../_shared/mapAppError'
import { json, readJson } from '../../../_shared/http'

interface BulkDeleteBody {
  ids: unknown
}

interface BulkCreateBody {
  transactions: unknown
}

export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const body = await readJson<BulkCreateBody>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await bulkCreateTransactions(repo, owner, body.transactions), 201)
  } catch (error) {
    mapAppError(error)
  }
}

export const onRequestDelete: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const body = await readJson<BulkDeleteBody>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await bulkDeleteTransactions(repo, owner, body.ids))
  } catch (error) {
    mapAppError(error)
  }
}
