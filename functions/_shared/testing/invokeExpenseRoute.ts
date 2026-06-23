import type { EventContext } from '@cloudflare/workers-types'
import type { Env, ExpensesData } from '../env'
import type { ExpenseRepository } from '../../domain/ports/expenseRepository'
import { HttpError, error } from '../http'
import { RepoHttpError } from '../../../src/testing/repoHttpError'

type RouteHandler = PagesFunction<Env, string, ExpensesData>
type HandlerContext = EventContext<Env, string, ExpensesData>

export interface InvokeExpenseRouteOptions {
  handler: RouteHandler
  repo: ExpenseRepository
  owner?: string
  method?: string
  url?: string
  body?: unknown
  params?: Record<string, string>
}

function handlerContext(
  request: Request,
  env: Env,
  params: Record<string, string>,
  data: ExpensesData,
): HandlerContext {
  return {
    request,
    env,
    params,
    data,
    functionPath: new URL(request.url).pathname,
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
  } as unknown as HandlerContext
}

function toHttpError(value: unknown): HttpError {
  if (value instanceof HttpError) return value
  if (value instanceof RepoHttpError) return new HttpError(value.status, value.message)
  if (value instanceof Error) return new HttpError(500, value.message)
  return new HttpError(500, 'Server error')
}

/** Invoke an expense route handler with an injected in-memory repository. */
export async function invokeExpenseRoute(options: InvokeExpenseRouteOptions): Promise<Response> {
  const owner = options.owner ?? 'owner@example.com'
  const headers = new Headers({ 'content-type': 'application/json' })
  const init: RequestInit = { method: options.method ?? 'POST', headers }
  if (options.body !== undefined) init.body = JSON.stringify(options.body)
  const request = new Request(
    options.url ?? 'https://expenses.test/api/expenses/accounts',
    init,
  )
  const data: ExpensesData = {
    owner,
    authenticatedEmail: owner,
    accessRepo: {} as ExpensesData['accessRepo'],
    repo: options.repo,
  }
  try {
    return await options.handler(
      handlerContext(request, {} as Env, options.params ?? {}, data),
    )
  } catch (e) {
    const httpError = toHttpError(e)
    return error(httpError.status, httpError.message)
  }
}
