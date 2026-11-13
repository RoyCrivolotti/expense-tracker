import { resolveVerifiedEmail } from '../_shared/access/accessIdentity'
import { requireAllowedEmail, requireExpensesGroupGrant, requireOwnerEmail } from '../_shared/access/accessAuthorizer'
import { touchLastSeenIfNeeded } from '../_shared/access/accessService'
import { createAccessDeps } from '../_shared/access/createAccessDeps'
import type { Env, ExpensesData } from '../_shared/env'
import { createD1AccessRepository } from '../_shared/adapters/d1AccessRepository'
import { createD1ExpenseRepository } from '../_shared/adapters/d1ExpenseRepository'
import { error } from '../_shared/http'
import { withDefaultResponseHeaders } from '../_shared/defaultResponseHeaders'
import { assertWriteIsSameOriginJson } from '../_shared/requestHygiene'
import { toHttpError } from '../_shared/mapAppError'
import { bumpRevision, bumpRevisionReadingPrevious } from '../_shared/dbRevision'
import { withWriteReceipt } from '../_shared/writeReceipt'

/**
 * The routes that answer to anyone Access has signed in, on the allow-list or not: a person asks for access, and asks
 * whether they have it, before anyone has approved them. The list is exact, so a route added under /api/access is
 * behind the allow-list until it is named here.
 */
const SIGNED_IN_ONLY_PATHS = new Set([
  '/api/access/request',
  '/api/access/status',
  '/api/access/grants',
  '/api/access/groups',
])

/** Everything under here is the owner's: the middleware refuses anyone else before the route runs. */
const ADMIN_PREFIX = '/api/access/admin/'

function withoutTrailingSlash(pathname: string): string {
  return pathname.replace(/\/+$/, '')
}

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Writes that change nothing the dataset's readers see, so they leave its revision alone: replacing the token would
 * make every cached copy of the person's ledger miss for no reason. Capture keys and card links are such writes.
 * Submitting a recommendation is not one of them, since it adds an expense.
 */
function leavesDatasetAlone(path: string): boolean {
  if (path === '/api/capture-keys' || path.startsWith('/api/capture-keys/')) return true
  if (path === '/api/capture-cards') return true
  return /^\/api\/recommendations\/[^/]+\/(dismiss|link)$/.test(path)
}

/**
 * Replace the owner's dataset revision before the handler runs and again after it, whether it
 * returned, answered with an error or threw (a write can land and the request still fail).
 *
 * The token the first bump replaced goes to the handler as `revisionBeforeWrite`, so that a write
 * made from a view of the ledger can be refused when the ledger has changed since that view.
 *
 * Before: if the Worker is cut off mid-write, nothing after the handler runs, and the token has
 * still moved for everyone who cached earlier. After: a reader who arrives mid-write caches the old
 * data under the first token, and only the second bump makes that copy miss. That one is retried
 * once, because a write with no bump after it leaves such a copy valid until the owner's next write.
 *
 * A write that worked answers with the token it found and the one it left (`withWriteReceipt`), so that
 * the browser that made it can keep its revision. The second is sent only if the second bump replaced
 * the token the first one left: otherwise another write began or ended in between, and the ledger at
 * the new token is not just the old one plus this write.
 */
async function aroundWrite(
  db: D1Database,
  owner: string,
  data: ExpensesData,
  run: () => Promise<Response>,
): Promise<Response> {
  const first = await bumpRevisionReadingPrevious(db, owner)
  data.revisionBeforeWrite = first.previous
  let response: Response
  try {
    response = await run()
  } catch (e) {
    await bumpRevision(db, owner).catch((bumpError) => {
      console.error('revision bump after a failed write also failed', bumpError)
    })
    throw e
  }
  const last = await bumpRevisionReadingPrevious(db, owner).catch(() => bumpRevisionReadingPrevious(db, owner))
  const consecutive = first.token !== null && last.previous === first.token
  return withWriteReceipt(response, { before: first.previous, after: consecutive ? last.token : null })
}

/** Request checks, auth gate and uniform error handling for every /api/* route. */
const handle: PagesFunction<Env, string, ExpensesData> = async (context) => {
  try {
    const pathname = new URL(context.request.url).pathname
    assertWriteIsSameOriginJson(context.request, pathname)
    const email = await resolveVerifiedEmail(context.request, context.env)
    const accessRepo = createD1AccessRepository(context.env)
    context.data.authenticatedEmail = email
    context.data.accessRepo = accessRepo
    context.data.owner = ''
    context.data.repo = createD1ExpenseRepository(context.env)

    const path = withoutTrailingSlash(pathname)
    if (SIGNED_IN_ONLY_PATHS.has(path)) {
      return await context.next()
    }
    if (path.startsWith(ADMIN_PREFIX)) {
      // The owner may not be on the allow-list (a fresh database), so this is not the group check below. Each
      // admin service function checks again; this one covers a route added without it.
      requireOwnerEmail(context.env, email)
      return await context.next()
    }

    await requireAllowedEmail(accessRepo, context.env, email)
    await requireExpensesGroupGrant(accessRepo, context.env, email)
    context.data.owner = email
    const deps = createAccessDeps(context.env)
    await touchLastSeenIfNeeded(deps, email)
    if (READ_ONLY_METHODS.has(context.request.method) || leavesDatasetAlone(path)) return await context.next()
    return await aroundWrite(context.env.DB, email, context.data, () => context.next())
  } catch (e) {
    // Routes that do not catch their own errors land here, and used to answer a
    // validation failure with 500 while the routes that did catch answered 400. The
    // same mapping in both places makes the status depend on the error, not the route.
    const mapped = toHttpError(e)
    return error(mapped.status, mapped.message, mapped.headers)
  }
}

export const onRequest: PagesFunction<Env, string, ExpensesData> = async (context) =>
  withDefaultResponseHeaders(await handle(context))
