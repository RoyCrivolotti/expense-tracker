import { resolveAuthenticatedEmail } from '../_shared/access/resolveAuthenticated'
import { requireAllowedEmail, requireExpensesGroupGrant } from '../_shared/access/accessAuthorizer'
import { touchLastSeenIfNeeded } from '../_shared/access/accessService'
import { createAccessDeps } from '../_shared/access/createAccessDeps'
import type { Env, ExpensesData } from '../_shared/env'
import { createD1AccessRepository } from '../_shared/adapters/d1AccessRepository'
import { createD1ExpenseRepository } from '../_shared/adapters/d1ExpenseRepository'
import { error } from '../_shared/http'
import { toHttpError } from '../_shared/mapAppError'
import { bumpRevision } from '../_shared/dbRevision'

function isAccessApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/access')
}

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Replace the owner's dataset revision before the handler runs and again after it, whether it
 * returned, answered with an error or threw (a write can land and the request still fail).
 *
 * Before: if the Worker is cut off mid-write, nothing after the handler runs, and the token has
 * still moved for everyone who cached earlier. After: a reader who arrives mid-write caches the old
 * data under the first token, and only the second bump makes that copy miss. That one is retried
 * once, because a write with no bump after it leaves such a copy valid until the owner's next write.
 */
async function aroundWrite(
  db: D1Database,
  owner: string,
  run: () => Promise<Response>,
): Promise<Response> {
  await bumpRevision(db, owner)
  let response: Response
  try {
    response = await run()
  } catch (e) {
    await bumpRevision(db, owner).catch((bumpError) => {
      console.error('revision bump after a failed write also failed', bumpError)
    })
    throw e
  }
  await bumpRevision(db, owner).catch(() => bumpRevision(db, owner))
  return response
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
    if (READ_ONLY_METHODS.has(context.request.method)) return await context.next()
    return await aroundWrite(context.env.DB, email, () => context.next())
  } catch (e) {
    // Routes that do not catch their own errors land here, and used to answer a
    // validation failure with 500 while the routes that did catch answered 400. The
    // same mapping in both places makes the status depend on the error, not the route.
    const mapped = toHttpError(e)
    return error(mapped.status, mapped.message)
  }
}
