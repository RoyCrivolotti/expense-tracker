import { createAccessDeps } from '../../../_shared/access/createAccessDeps'
import { approveAccessRequestById } from '../../../_shared/access/accessService'
import type { Env, ExpensesData } from '../../../_shared/env'
import { json, readJson } from '../../../_shared/http'

export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const body = await readJson<{ requestId?: string }>(context.request)
  const requestId = body.requestId?.trim()
  if (!requestId) return json({ error: 'Missing requestId' }, 400)
  const deps = createAccessDeps(context.env)
  const result = await approveAccessRequestById(
    deps,
    requestId,
    context.data.authenticatedEmail,
  )
  return json({ email: result.email, approved: true })
}
