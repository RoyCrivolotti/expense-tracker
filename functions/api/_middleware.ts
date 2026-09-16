import { resolveAuthenticatedEmail } from '../_shared/access/resolveAuthenticated'
import { requireAllowedEmail, requireExpensesGroupGrant } from '../_shared/access/accessAuthorizer'
import { touchLastSeenIfNeeded } from '../_shared/access/accessService'
import { createAccessDeps } from '../_shared/access/createAccessDeps'
import type { Env, ExpensesData } from '../_shared/env'
import { createD1AccessRepository } from '../_shared/adapters/d1AccessRepository'
import { createD1ExpenseRepository } from '../_shared/adapters/d1ExpenseRepository'
import { error } from '../_shared/http'
import { toHttpError } from '../_shared/mapAppError'

function isAccessApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/access')
}

/** Auth gate + uniform error handling for every /api/* route. */
export const onRequest: PagesFunction<Env, string, ExpensesData> = async (context) => {
  try {
    const pathname = new URL(context.request.url).pathname
    const email = resolveAuthenticatedEmail(context.request)
    const accessRepo = createD1AccessRepository(context.env)
    context.data.authenticatedEmail = email
    context.data.accessRepo = accessRepo
    context.data.owner = ''
    context.data.repo = createD1ExpenseRepository(context.env)

    if (isAccessApiPath(pathname)) {
      return await context.next()
    }

    await requireAllowedEmail(accessRepo, context.env, email)
    await requireExpensesGroupGrant(accessRepo, context.env, email)
    context.data.owner = email
    const deps = createAccessDeps(context.env)
    await touchLastSeenIfNeeded(deps, email)
    return await context.next()
  } catch (e) {
    // Routes that do not catch their own errors land here, and used to answer a
    // validation failure with 500 while the routes that did catch answered 400. The
    // same mapping in both places makes the status depend on the error, not the route.
    const mapped = toHttpError(e)
    return error(mapped.status, mapped.message)
  }
}
