import type { Env, ExpensesData } from '../../_shared/env'
import { json } from '../../_shared/http'

export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const { repo, owner } = context.data
  return json(await repo.loadDataset(owner))
}
