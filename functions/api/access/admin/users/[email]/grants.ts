import { createAccessDeps } from '../../../../../_shared/access/createAccessDeps'
import { updateUserGroupGrants } from '../../../../../_shared/access/accessService'
import type { Env, ExpensesData } from '../../../../../_shared/env'
import { json, readJson } from '../../../../../_shared/http'
import type { AccessGroupId } from '../../../../../domain/accessGroups'

export const onRequestPatch: PagesFunction<Env, 'email', ExpensesData> = async (context) => {
  const email = decodeURIComponent(String(context.params.email ?? '')).trim().toLowerCase()
  if (!email) return json({ error: 'Missing email' }, 400)
  const body = await readJson<{ groups?: Partial<Record<AccessGroupId, boolean>> }>(
    context.request,
  )
  if (!body.groups || typeof body.groups !== 'object') {
    return json({ error: 'Missing groups' }, 400)
  }
  const deps = createAccessDeps(context.env)
  const result = await updateUserGroupGrants(
    deps,
    email,
    context.data.authenticatedEmail,
    body.groups,
  )
  return json(result)
}
