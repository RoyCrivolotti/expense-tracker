import type { Env, ExpensesData } from '../_shared/env'
import { requireUser } from '../_shared/auth'
import { HttpError, error } from '../_shared/http'

/** Auth gate + uniform error handling for every /api/* route. */
export const onRequest: PagesFunction<Env, string, ExpensesData> = async (context) => {
  try {
    context.data.owner = requireUser(context.request, context.env)
    return await context.next()
  } catch (e) {
    if (e instanceof HttpError) return error(e.status, e.message)
    return error(500, e instanceof Error ? e.message : 'Server error')
  }
}
