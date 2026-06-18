import type { Env, ExpensesData } from '../../_shared/env'
import { loadDataset } from '../../_shared/db'
import { json } from '../../_shared/http'

export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  return json(await loadDataset(context.env, context.data.owner))
}
