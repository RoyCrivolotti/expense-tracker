import type { Env, ExpensesData } from '../../../_shared/env'
import { HttpError, json, readJson } from '../../../_shared/http'
import { parseDeleteTransactionIds } from '../../../domain/data/transactionIds'

interface BulkDeleteBody {
  ids: unknown
}

export const onRequestDelete: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const body = await readJson<BulkDeleteBody>(context.request)
  let ids: number[]
  try {
    ids = parseDeleteTransactionIds(body.ids)
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : 'Invalid ids')
  }
  const { repo, owner } = context.data
  const deleted = await repo.deleteTransactions(owner, ids)
  return json({ deleted, requested: ids.length })
}
