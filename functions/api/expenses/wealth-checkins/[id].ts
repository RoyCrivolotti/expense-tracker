import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewWealthCheckin } from '../../../domain/data/dataSource'
import { patchWealthCheckin, removeWealthCheckin } from '../../../domain/application/wealthService'
import { mapAppError } from '../../../_shared/mapAppError'
import { json, readJson } from '../../../_shared/http'
import { parseNumericId } from '../../../_shared/params'

export const onRequestPatch: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const patch = await readJson<Partial<NewWealthCheckin>>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await patchWealthCheckin(repo, owner, id, patch))
  } catch (error) {
    mapAppError(error)
  }
}

export const onRequestDelete: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const { repo, owner } = context.data
  try {
    await removeWealthCheckin(repo, owner, id)
    return json({ ok: true })
  } catch (error) {
    mapAppError(error)
  }
}
