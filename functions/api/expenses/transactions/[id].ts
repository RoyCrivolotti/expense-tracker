import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewTransaction } from '../../../../src/domain/data/dataSource'
import { deleteTransaction, updateTransaction } from '../../../_shared/dbWrite'
import { HttpError, json, readJson } from '../../../_shared/http'

function parseId(params: Record<string, string | string[]>): number {
  const raw = Array.isArray(params.id) ? params.id[0] : params.id
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid transaction id')
  return id
}

export const onRequestPatch: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseId(context.params)
  const patch = await readJson<Partial<NewTransaction>>(context.request)
  return json(await updateTransaction(context.env, context.data.owner, id, patch))
}

export const onRequestDelete: PagesFunction<Env, string, ExpensesData> = async (context) => {
  await deleteTransaction(context.env, context.data.owner, parseId(context.params))
  return json({ ok: true })
}
