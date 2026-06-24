import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewGoalScenario } from '../../../domain/data/dataSource'
import { patchScenario, removeScenario } from '../../../domain/application/goalService'
import { mapAppError } from '../../../_shared/mapAppError'
import { json, readJson } from '../../../_shared/http'
import { parseNumericId } from '../../../_shared/params'

export const onRequestPatch: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const patch = await readJson<Partial<NewGoalScenario>>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await patchScenario(repo, owner, id, patch))
  } catch (error) {
    mapAppError(error)
  }
}

export const onRequestDelete: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const { repo, owner } = context.data
  await removeScenario(repo, owner, id)
  return json({ ok: true })
}
