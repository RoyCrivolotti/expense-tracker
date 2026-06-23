import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewAccount } from '../../../domain/data/dataSource'
import { json, readJson } from '../../../_shared/http'
import { parseNumericId } from '../../../_shared/params'

export const onRequestPatch: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const patch = await readJson<Partial<NewAccount>>(context.request)
  const { repo, owner } = context.data
  return json(await repo.updateAccount(owner, id, patch))
}
