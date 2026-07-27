import type { Env, ExpensesData } from '../../../_shared/env'
import type { DeleteCategoryOptions, NewCategory } from '../../../domain/data/dataSource'
import { patchCategory, removeCategory } from '../../../domain/application/categoryService'
import { mapAppError } from '../../../_shared/mapAppError'
import { json, readJson } from '../../../_shared/http'
import { parseNumericId } from '../../../_shared/params'

export const onRequestPatch: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const patch = await readJson<Partial<NewCategory>>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await patchCategory(repo, owner, id, patch))
  } catch (error) {
    mapAppError(error)
  }
}

export const onRequestDelete: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const options = await readJson<DeleteCategoryOptions>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await removeCategory(repo, owner, id, options))
  } catch (error) {
    mapAppError(error)
  }
}
