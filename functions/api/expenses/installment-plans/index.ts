import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewInstallmentPlan } from '../../../domain/data/dataSource'
import { createPlan } from '../../../domain/application/installmentPlanService'
import { mapAppError } from '../../../_shared/mapAppError'
import { json, readJson } from '../../../_shared/http'

export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const input = await readJson<NewInstallmentPlan>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await createPlan(repo, owner, input), 201)
  } catch (error) {
    mapAppError(error)
  }
}
