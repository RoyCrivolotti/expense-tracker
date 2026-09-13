import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewTransaction } from '../../../domain/data/dataSource'
import {
  patchTransaction,
  removeTransaction,
} from '../../../domain/application/transactionService'
import { mapAppError } from '../../../_shared/mapAppError'
import { receiptStore } from '../../../_shared/receiptStoreFactory'
import { removeReceiptsForTransactions } from '../../../_shared/receiptService'
import { json, readJson } from '../../../_shared/http'
import { parseNumericId } from '../../../_shared/params'

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
    // Bytes first, while the rows naming their keys still exist; the rows
    // themselves cascade inside the delete's own batch.
    await removeReceiptsForTransactions(repo, receiptStore(context.env), owner, [id])
    await removeTransaction(repo, owner, id)
    return json({ ok: true })
  } catch (error) {
    mapAppError(error)
  }
}
