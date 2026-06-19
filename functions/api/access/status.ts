import { createAccessDeps } from '../../_shared/access/createAccessDeps'
import { getAccessStatus } from '../../_shared/access/accessService'
import type { Env, ExpensesData } from '../../_shared/env'
import { json } from '../../_shared/http'

export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const deps = createAccessDeps(context.env)
  const status = await getAccessStatus(deps, context.data.authenticatedEmail)
  return json(status)
}
