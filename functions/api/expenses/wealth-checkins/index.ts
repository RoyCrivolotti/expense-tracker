import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewWealthCheckin } from '../../../domain/data/dataSource'
import { createWealthCheckin } from '../../../domain/application/wealthService'
import { mapAppError } from '../../../_shared/mapAppError'
import { json, readJson } from '../../../_shared/http'

export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const input = await readJson<NewWealthCheckin>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await createWealthCheckin(repo, owner, input), 201)
  } catch (error) {
    mapAppError(error)
  }
}
