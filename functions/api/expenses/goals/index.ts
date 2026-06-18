import type { Env, ExpensesData } from '../../../_shared/env'
import type { GoalInputs } from '../../../../src/types'
import { updateGoals } from '../../../_shared/dbConfig'
import { json, readJson } from '../../../_shared/http'

export const onRequestPut: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const patch = await readJson<Partial<GoalInputs>>(context.request)
  return json(await updateGoals(context.env, context.data.owner, patch))
}
