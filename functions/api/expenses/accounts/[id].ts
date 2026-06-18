import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewAccount } from '../../../../src/domain/data/dataSource'
import { updateAccount } from '../../../_shared/dbConfig'
import { HttpError, json, readJson } from '../../../_shared/http'

function parseId(params: Record<string, string | string[]>): number {
  const raw = Array.isArray(params.id) ? params.id[0] : params.id
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid account id')
  return id
}

export const onRequestPatch: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseId(context.params)
  const patch = await readJson<Partial<NewAccount>>(context.request)
  return json(await updateAccount(context.env, context.data.owner, id, patch))
}
