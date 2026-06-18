import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewCategory } from '../../../../src/data/dataSource'
import { createCategory } from '../../../_shared/dbConfig'
import { HttpError, json, readJson } from '../../../_shared/http'

export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const input = await readJson<NewCategory>(context.request)
  if (!input.name?.trim()) throw new HttpError(400, 'Category name is required')
  return json(await createCategory(context.env, context.data.owner, input))
}
