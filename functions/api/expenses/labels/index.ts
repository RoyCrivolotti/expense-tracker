import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewLabel } from '../../../domain/data/dataSource'
import { createLabel } from '../../../domain/application/labelService'
import { mapAppError } from '../../../_shared/mapAppError'
import { json, readJson } from '../../../_shared/http'

export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const body = await readJson<NewLabel>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await createLabel(repo, owner, body), 201)
  } catch (error) {
    mapAppError(error)
  }
}
