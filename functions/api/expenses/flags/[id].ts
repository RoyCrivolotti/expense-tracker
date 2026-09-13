import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewFlag } from '../../../domain/data/dataSource'
import { patchFlag, removeFlag } from '../../../domain/application/flagService'
import { mapAppError } from '../../../_shared/mapAppError'
import { parseNumericId } from '../../../_shared/params'
import { json, readJson } from '../../../_shared/http'

export const onRequestPatch: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const patch = await readJson<Partial<NewFlag>>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await patchFlag(repo, owner, id, patch))
  } catch (error) {
    mapAppError(error)
  }
}

export const onRequestDelete: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const { repo, owner } = context.data
  try {
    return json(await removeFlag(repo, owner, id))
  } catch (error) {
    mapAppError(error)
  }
}
