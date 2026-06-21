import type { EventContext } from '@cloudflare/workers-types'
import type { Env, ExpensesData } from './env'
import { createD1AccessRepository } from './adapters/d1AccessRepository'
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

function defaultTestEnv(overrides: Env): Env {
  return {
    ALLOWED_EMAILS: 'owner@example.com',
    ALLOW_BOOTSTRAP: '1',
    ...overrides,
  }
}

/** Mock D1 access tables so middleware allowlist falls back to ALLOWED_EMAILS. */
function withAccessTableMocks(env: Env): Env {
  const base = env.DB
  return {
    ...env,
    DB: {
      prepare(sql: string) {
        if (sql.includes('allowed_users')) {
          if (sql.includes('COUNT(*)')) {
            return {
              first: () => Promise.resolve({ n: 0 }),
              bind: () => ({ first: () => Promise.resolve({ n: 0 }) }),
            }
          }
          if (sql.includes('SELECT 1')) {
            return {
              bind: () => ({ first: () => Promise.resolve(null) }),
            }
          }
          if (sql.includes('last_seen_at')) {
            return {
              bind: () => ({ run: () => Promise.resolve({}) }),
            }
          }
          if (sql.includes('SELECT *')) {
            return {
              bind: () => ({ first: () => Promise.resolve(null) }),
            }
          }
        }
        if (sql.includes('user_group_grants')) {
          return {
            bind: () => ({
              all: () => Promise.resolve({ results: [{ group_id: 'expenses' }] }),
            }),
          }
        }
        return base.prepare(sql)
      },
    } as unknown as D1Database,
  }
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
  const env = withAccessTableMocks(defaultTestEnv(options.env))
  const data: ExpensesData = {
    owner: '',
    authenticatedEmail: '',
    accessRepo: createD1AccessRepository(env),
    repo: createD1ExpenseRepository(env),
  }
  const params = options.params ?? {}
  const routeNext: HandlerContext['next'] = () =>
    Promise.resolve(
      handler(
        handlerContext(request, env, params, data, () =>
          Promise.resolve(new Response(null, { status: 404 })),
        ),
      ),
    )
  return authMiddleware(handlerContext(request, env, params, data, routeNext))
}
