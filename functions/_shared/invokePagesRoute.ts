import type { Env, ExpensesData } from './env'
import { onRequest as authMiddleware } from '../api/_middleware'

type RouteHandler = PagesFunction<Env, string, ExpensesData>

interface InvokeOptions {
  env: Env
  method?: string
  url?: string
  body?: unknown
  params?: Record<string, string>
  /** Omit header when false; defaults to owner@example.com. */
  email?: string | false
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
  const data: ExpensesData = { owner: '' }
  const params = options.params ?? {}
  const base = {
    request,
    env: options.env,
    params,
    data,
    functionPath: '/api/expenses/transactions',
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
  }
  return authMiddleware({
    ...base,
    next: () =>
      Promise.resolve(
        handler({
          ...base,
          next: () => Promise.resolve(new Response(null, { status: 404 })),
        }),
      ),
  })
}
