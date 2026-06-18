import type { Env, ExpensesData } from '../../../_shared/env'
import type { ExpenseSettings } from '../../../../src/types'
import { updateSettings } from '../../../_shared/dbConfig'
import { json, readJson } from '../../../_shared/http'

export const onRequestPut: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const patch = await readJson<Partial<ExpenseSettings>>(context.request)
  return json(await updateSettings(context.env, context.data.owner, patch))
}
