import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewCategory } from '../../../domain/data/dataSource'
import { json, readJson } from '../../../_shared/http'
import { parseNumericId } from '../../../_shared/params'

export const onRequestPatch: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const patch = await readJson<Partial<NewCategory>>(context.request)
  const { repo, owner } = context.data
  return json(await repo.updateCategory(owner, id, patch))
}
