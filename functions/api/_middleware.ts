import type { Env, ExpensesData } from '../_shared/env'
import { cloudflareAccessAuth } from '../_shared/adapters/cloudflareAccessAuth'
import { createD1ExpenseRepository } from '../_shared/adapters/d1ExpenseRepository'
import { HttpError, error } from '../_shared/http'

/** Auth gate + uniform error handling for every /api/* route. */
export const onRequest: PagesFunction<Env, string, ExpensesData> = async (context) => {
  try {
    context.data.repo = createD1ExpenseRepository(context.env)
    context.data.owner = cloudflareAccessAuth.resolveUser(context.request, {
      allowedEmails: context.env.ALLOWED_EMAILS,
    })
    return await context.next()
  } catch (e) {
    if (e instanceof HttpError) return error(e.status, e.message)
    return error(500, e instanceof Error ? e.message : 'Server error')
  }
}
