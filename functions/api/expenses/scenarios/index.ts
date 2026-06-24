import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewGoalScenario } from '../../../domain/data/dataSource'
import { HttpError, json, readJson } from '../../../_shared/http'

export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const input = await readJson<NewGoalScenario>(context.request)
  if (!input.name?.trim()) throw new HttpError(400, 'Scenario name is required')
  const { repo, owner } = context.data
  return json(await repo.createScenario(owner, input), 201)
}
