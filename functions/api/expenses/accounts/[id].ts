import type { Env, ExpensesData } from '../../../_shared/env'
import type { DeleteAccountOptions, NewAccount } from '../../../domain/data/dataSource'
import { removeAccount } from '../../../domain/application/accountService'
import { mapAppError } from '../../../_shared/mapAppError'
import { json, readJson } from '../../../_shared/http'
import { parseNumericId } from '../../../_shared/params'

export const onRequestPatch: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const patch = await readJson<Partial<NewAccount>>(context.request)
  const { repo, owner } = context.data
  return json(await repo.updateAccount(owner, id, patch))
}

export const onRequestDelete: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const options = await readJson<DeleteAccountOptions>(context.request)
  const { repo, owner } = context.data
  try {
    return json(await removeAccount(repo, owner, id, options))
  } catch (error) {
    mapAppError(error)
  }
}
