import type { Env, ExpensesData } from '../../../_shared/env'
import {
  bulkCreateTransactions,
  bulkDeleteTransactions,
  bulkUpdateTransactions,
} from '../../../domain/application/transactionService'
import { mapAppError } from '../../../_shared/mapAppError'
import { receiptStore } from '../../../_shared/receiptStoreFactory'
import { removeReceiptsForTransactions } from '../../../_shared/receiptService'
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
    // Same order as the single delete: bytes first, rows cascade with the batch.
    if (Array.isArray(body.ids)) {
      const ids = body.ids.filter((id): id is number => Number.isInteger(id))
      await removeReceiptsForTransactions(repo, receiptStore(context.env), owner, ids)
    }
    return json(await bulkDeleteTransactions(repo, owner, body.ids))
  } catch (error) {
    mapAppError(error)
  }
}

interface BulkUpdateBody {
  ids: unknown
  patch: unknown
}

export const onRequestPatch: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const body = await readJson<BulkUpdateBody>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await bulkUpdateTransactions(repo, owner, body.ids, body.patch))
  } catch (error) {
    mapAppError(error)
  }
}
