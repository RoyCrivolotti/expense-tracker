import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewCategory } from '../../../domain/data/dataSource'
import { createCategory } from '../../../domain/application/categoryService'
import { mapAppError } from '../../../_shared/mapAppError'
import { json, readJson } from '../../../_shared/http'

export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const input = await readJson<NewCategory>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await createCategory(repo, owner, input), 201)
  } catch (error) {
    mapAppError(error)
  }
}
