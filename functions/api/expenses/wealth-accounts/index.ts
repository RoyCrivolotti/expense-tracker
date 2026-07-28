import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewWealthAccount } from '../../../domain/data/dataSource'
import { createWealthAccount } from '../../../domain/application/wealthService'
import { mapAppError } from '../../../_shared/mapAppError'
import { json, readJson } from '../../../_shared/http'

export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const input = await readJson<NewWealthAccount>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await createWealthAccount(repo, owner, input), 201)
  } catch (error) {
    mapAppError(error)
  }
}
