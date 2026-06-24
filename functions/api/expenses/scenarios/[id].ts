import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewGoalScenario } from '../../../domain/data/dataSource'
import { HttpError, json, readJson } from '../../../_shared/http'
import { parseNumericId } from '../../../_shared/params'

export const onRequestPatch: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const patch = await readJson<Partial<NewGoalScenario>>(context.request)
  const keys = Object.keys(patch)
  if (keys.length === 0) throw new HttpError(400, 'Empty patch')
  const { repo, owner } = context.data
  return json(await repo.updateScenario(owner, id, patch))
}

export const onRequestDelete: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const { repo, owner } = context.data
  await repo.deleteScenario(owner, id)
  return json({ ok: true })
}
