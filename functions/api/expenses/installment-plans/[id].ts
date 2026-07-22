import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewInstallmentPlan } from '../../../domain/data/dataSource'
import { patchPlan, removePlan } from '../../../domain/application/installmentPlanService'
import { mapAppError } from '../../../_shared/mapAppError'
import { json, readJson } from '../../../_shared/http'
import { parseNumericId } from '../../../_shared/params'

export const onRequestPatch: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const patch = await readJson<Partial<NewInstallmentPlan>>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await patchPlan(repo, owner, id, patch))
  } catch (error) {
    mapAppError(error)
  }
}

export const onRequestDelete: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const { repo, owner } = context.data
  await removePlan(repo, owner, id)
  return json({ ok: true })
}
