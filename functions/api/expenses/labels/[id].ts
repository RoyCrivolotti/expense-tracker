import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewLabel } from '../../../domain/data/dataSource'
import { patchLabel, removeLabel } from '../../../domain/application/labelService'
import { mapAppError } from '../../../_shared/mapAppError'
import { parseNumericId } from '../../../_shared/params'
import { json, readJson } from '../../../_shared/http'

export const onRequestPatch: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const patch = await readJson<Partial<NewLabel>>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await patchLabel(repo, owner, id, patch))
  } catch (error) {
    mapAppError(error)
  }
}

export const onRequestDelete: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const { repo, owner } = context.data
  try {
    return json(await removeLabel(repo, owner, id))
  } catch (error) {
    mapAppError(error)
  }
}
