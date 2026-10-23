import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewTransaction } from '../../../domain/data/dataSource'
import {
  patchTransaction,
  removeTransaction,
} from '../../../domain/application/transactionService'
import { mapAppError } from '../../../_shared/mapAppError'
import { receiptStore } from '../../../_shared/receiptStoreFactory'
import { deleteWithReceipts } from '../../../_shared/receiptService'
import { HttpError, json, readJson } from '../../../_shared/http'
import { parseNumericId } from '../../../_shared/params'

/** One transaction as the dataset carries it. A row that is not the caller's reads as missing. */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const { repo, owner } = context.data
  const transaction = await repo.getTransaction(owner, id)
  if (!transaction) throw new HttpError(404, 'Transaction not found')
  return json(transaction)
}

export const onRequestPatch: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const patch = await readJson<Partial<NewTransaction>>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await patchTransaction(repo, owner, id, patch))
  } catch (error) {
    mapAppError(error)
  }
}

export const onRequestDelete: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const { repo, owner } = context.data
  const id = parseNumericId(context.params, 'id')
  try {
    await deleteWithReceipts(repo, receiptStore(context.env), owner, [id], () => removeTransaction(repo, owner, id))
    return json({ ok: true })
  } catch (error) {
    mapAppError(error)
  }
}
