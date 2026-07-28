import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewWealthAccount } from '../../../domain/data/dataSource'
import { patchWealthAccount, removeWealthAccount } from '../../../domain/application/wealthService'
import { mapAppError } from '../../../_shared/mapAppError'
import { json, readJson } from '../../../_shared/http'
import { parseNumericId } from '../../../_shared/params'

export const onRequestPatch: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const patch = await readJson<Partial<NewWealthAccount>>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await patchWealthAccount(repo, owner, id, patch))
  } catch (error) {
    mapAppError(error)
  }
}

export const onRequestDelete: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const { repo, owner } = context.data
  try {
    await removeWealthAccount(repo, owner, id)
    return json({ ok: true })
  } catch (error) {
    mapAppError(error)
  }
}
