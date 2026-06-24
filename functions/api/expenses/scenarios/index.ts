import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewGoalScenario } from '../../../domain/data/dataSource'
import { createScenario } from '../../../domain/application/goalService'
import { mapAppError } from '../../../_shared/mapAppError'
import { json, readJson } from '../../../_shared/http'

export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const input = await readJson<NewGoalScenario>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await createScenario(repo, owner, input), 201)
  } catch (error) {
    mapAppError(error)
  }
}
