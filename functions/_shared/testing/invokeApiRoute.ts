import type { EventContext } from '@cloudflare/workers-types'
import type { Env, ExpensesData } from '../env'
import { createD1AccessRepository } from '../adapters/d1AccessRepository'
import { createD1ExpenseRepository } from '../adapters/d1ExpenseRepository'
import { onRequest as authMiddleware } from '../../api/_middleware'

type RouteHandler = PagesFunction<Env, string, ExpensesData>
type HandlerContext = EventContext<Env, string, ExpensesData>

export interface InvokeApiOptions {
  handler: RouteHandler
  env: Env
  url: string
  method?: string
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
  functionPath: string,
): HandlerContext {
  return {
    request,
    env,
    params,
    data,
    functionPath,
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
    next,
  } as unknown as HandlerContext
}

function defaultTestEnv(overrides: Env): Env {
  return {
    ALLOWED_EMAILS: 'owner@example.com',
    ALLOW_BOOTSTRAP: '1',
    OWNER_EMAIL: 'owner@example.com',
    ...overrides,
  }
}

/** Run a Pages route handler through the real /api auth middleware. */
export async function invokeApiRoute(options: InvokeApiOptions): Promise<Response> {
  const headers = new Headers()
  if (options.email !== false) {
    headers.set('Cf-Access-Authenticated-User-Email', options.email ?? 'owner@example.com')
  }
  const init: RequestInit = { method: options.method ?? 'GET', headers }
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json')
    init.body = JSON.stringify(options.body)
  }
  const request = new Request(options.url, init)
  const env = defaultTestEnv(options.env)
  const data: ExpensesData = {
    owner: '',
    authenticatedEmail: '',
    accessRepo: createD1AccessRepository(env),
    repo: createD1ExpenseRepository(env),
  }
  const params = options.params ?? {}
  const pathname = new URL(options.url).pathname
  const routeNext: HandlerContext['next'] = () =>
    Promise.resolve(
      options.handler(
        handlerContext(
          request,
          env,
          params,
          data,
          () => Promise.resolve(new Response(null, { status: 404 })),
          pathname,
        ),
      ),
    )
  return authMiddleware(handlerContext(request, env, params, data, routeNext, pathname))
}

/** Handler that succeeds when middleware allows the request through. */
export const middlewareProbeHandler: RouteHandler = () =>
  Promise.resolve(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  )
