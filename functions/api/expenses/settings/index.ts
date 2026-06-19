import type { Env, ExpensesData } from '../../../_shared/env'
import type { ExpenseSettings } from '@domain/types'
import { json, readJson } from '../../../_shared/http'

export const onRequestPut: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const patch = await readJson<Partial<ExpenseSettings>>(context.request)
  const { repo, owner } = context.data
  return json(await repo.updateSettings(owner, patch))
}
