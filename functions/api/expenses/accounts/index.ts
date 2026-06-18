import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewAccount } from '../../../../src/data/dataSource'
import { createAccount } from '../../../_shared/dbConfig'
import { HttpError, json, readJson } from '../../../_shared/http'

export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const input = await readJson<NewAccount>(context.request)
  if (!input.name?.trim()) throw new HttpError(400, 'Account name is required')
  return json(await createAccount(context.env, context.data.owner, input))
}
