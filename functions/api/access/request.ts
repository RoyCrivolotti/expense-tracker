import { createAccessDeps } from '../../_shared/access/createAccessDeps'
import { submitAccessRequest } from '../../_shared/access/accessService'
import type { Env, ExpensesData } from '../../_shared/env'
import { json } from '../../_shared/http'

export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const deps = createAccessDeps(context.request, context.env)
  const result = await submitAccessRequest(deps, context.data.authenticatedEmail)
  return json(result)
}
