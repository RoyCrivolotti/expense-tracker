import type { EventContext } from '@cloudflare/workers-types'
import type { Env, ExpensesData } from './env'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import { onRequest as authMiddleware } from '../api/_middleware'

type RouteHandler = PagesFunction<Env, string, ExpensesData>
type HandlerContext = EventContext<Env, string, ExpensesData>

interface InvokeOptions {
  env: Env
  method?: string
  url?: string
  body?: unknown
  params?: Record<string, string>
  /** Omit header when false; defaults to owner@example.com. */
  email?: string | false
}

function handlerContext(
  request: Request,
  env: Env,
  params: Record<string, string>,
  data: ExpensesData,
  next: HandlerContext['next'],
): HandlerContext {
  return {
    request,
    env,
    params,
    data,
    functionPath: '/api/expenses/transactions',
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
    next,
  } as unknown as HandlerContext
}

/** Run a Pages route handler through the real auth middleware (integration tests). */
export async function invokePagesRoute(
  handler: RouteHandler,
  options: InvokeOptions,
): Promise<Response> {
  const headers = new Headers()
  if (options.email !== false) {
    headers.set('Cf-Access-Authenticated-User-Email', options.email ?? 'owner@example.com')
  }
  const init: RequestInit = { method: options.method ?? 'POST', headers }
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json')
    init.body = JSON.stringify(options.body)
  }
  const request = new Request(
    options.url ?? 'https://expenses.test/api/expenses/transactions',
    init,
  )
  const data: ExpensesData = {
    owner: '',
    repo: createD1ExpenseRepository(options.env),
  }
  const params = options.params ?? {}
  const routeNext: HandlerContext['next'] = () =>
    Promise.resolve(
      handler(
        handlerContext(request, options.env, params, data, () =>
          Promise.resolve(new Response(null, { status: 404 })),
        ),
      ),
    )
  return authMiddleware(handlerContext(request, options.env, params, data, routeNext))
}
