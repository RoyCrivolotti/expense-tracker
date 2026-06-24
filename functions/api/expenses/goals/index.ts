import type { Env, ExpensesData } from '../../../_shared/env'
import type { GoalInputs } from '../../../domain/types'
import { saveGoals } from '../../../domain/application/goalService'
import { json, readJson } from '../../../_shared/http'

export const onRequestPut: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const patch = await readJson<Partial<GoalInputs>>(context.request)
  const { repo, owner } = context.data
  return json(await saveGoals(repo, owner, patch))
}
