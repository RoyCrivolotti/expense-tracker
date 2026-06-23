import { createAccessDeps } from '../../../../../_shared/access/createAccessDeps'
import { updateUserGroupGrants } from '../../../../../_shared/access/accessService'
import type { Env, ExpensesData } from '../../../../../_shared/env'
import { HttpError, json, readJson } from '../../../../../_shared/http'
import type { AccessGroupId } from '../../../../../domain/accessGroups'

export const onRequestPatch: PagesFunction<Env, 'email', ExpensesData> = async (context) => {
  const email = decodeURIComponent(String(context.params.email ?? '')).trim().toLowerCase()
  if (!email) throw new HttpError(400, 'Missing email')
  const body = await readJson<{ groups?: Partial<Record<AccessGroupId, boolean>> }>(
    context.request,
  )
  if (!body.groups || typeof body.groups !== 'object') {
    throw new HttpError(400, 'Missing groups')
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
