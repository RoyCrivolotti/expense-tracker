import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewFlag } from '../../../domain/data/dataSource'
import { createFlag } from '../../../domain/application/flagService'
import { mapAppError } from '../../../_shared/mapAppError'
import { json, readJson } from '../../../_shared/http'

export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const body = await readJson<NewFlag>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await createFlag(repo, owner, body), 201)
  } catch (error) {
    mapAppError(error)
  }
}
