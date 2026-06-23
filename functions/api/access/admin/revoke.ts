import { createAccessDeps } from '../../../_shared/access/createAccessDeps'
import { revokeAccessByEmail } from '../../../_shared/access/accessService'
import type { Env, ExpensesData } from '../../../_shared/env'
import { HttpError, json, readJson } from '../../../_shared/http'

export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const body = await readJson<{ email?: string }>(context.request)
  const email = body.email?.trim()
  if (!email) throw new HttpError(400, 'Missing email')
  const deps = createAccessDeps(context.env)
  const result = await revokeAccessByEmail(deps, email, context.data.authenticatedEmail)
  return json({ email: result.email, revoked: true, dataPurged: result.dataPurged })
}
