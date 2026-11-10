// @vitest-environment node
/**
 * Every route under functions/api, found from the files, through the real middleware: with no identity it is a 401,
 * and with an identity that is not approved it is a 403, except the few routes listed below. A new route file is
 * covered without anyone adding it here, and a new route that must be open to unapproved people has to be named.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Env, ExpensesData } from '../_shared/env'
import { createD1ExpenseRepository } from '../_shared/adapters/d1ExpenseRepository'
import { invokeExpenseApiRoute } from '../_shared/testing/invokeExpenseApiRoute'
import { OTHER, OWNER, createExpenseWorld, type World } from '../_shared/testing/expenseWorld'
import { migratedDatabase, newStats, sqliteD1 } from '../../src/testing/sqliteD1'

type Handler = PagesFunction<Env, string, ExpensesData>

const modules = import.meta.glob<Record<string, unknown>>(['./**/*.ts', '!./**/*.test.ts', '!./_middleware.ts'], {
  eager: true,
})
/** Source of every file under functions/ that is not an API route, to check none of them is one. */
const elsewhere = import.meta.glob<string>(['../**/*.ts', '!../api/**', '!../**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

/**
 * The routes that answer a person Access has signed in but nobody has approved, which is how they ask to be approved.
 * Reviewed by hand: everything else must refuse them. `POST /api/access/request` is not called below because it writes.
 */
const OPEN_TO_UNAPPROVED = new Set([
  'GET /api/access/status',
  'GET /api/access/groups',
  'GET /api/access/grants',
  'POST /api/access/request',
])

const METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'Head', 'Options'] as const
const STRANGER = 'stranger@example.com'

interface Route {
  key: string
  url: string
  method: string
  handler: Handler
}

const PARAM_VALUE: Record<string, string> = { id: '1', email: 'someone@example.com' }

function routePath(file: string): string {
  return (
    '/api' +
    file
      .replace(/^\./, '')
      .replace(/\.ts$/, '')
      .replace(/\[(\w+)\]/g, (_m, name: string) => encodeURIComponent(PARAM_VALUE[name] ?? '1'))
      .replace(/\/index$/, '')
  )
}

function paramsOf(file: string): Record<string, string> {
  return Object.fromEntries([...file.matchAll(/\[(\w+)\]/g)].map((m) => [m[1] as string, PARAM_VALUE[m[1] as string] ?? '1']))
}

const routes: Route[] = []
const paramsByUrl = new Map<string, Record<string, string>>()
for (const [file, exports] of Object.entries(modules)) {
  const url = `https://expenses.test${routePath(file)}`
  paramsByUrl.set(url, paramsOf(file))
  const handlers = [['', exports.onRequest], ...METHODS.map((m) => [m, exports[`onRequest${m}`]] as const)]
  for (const [method, handler] of handlers) {
    if (typeof handler !== 'function') continue
    routes.push({ key: `${method === '' ? 'ANY' : method.toUpperCase()} ${new URL(url).pathname}`, url, method: method === '' ? 'GET' : method.toUpperCase(), handler: handler as Handler })
  }
}
routes.sort((a, b) => a.key.localeCompare(b.key))

let world: World

beforeAll(() => {
  const sqlite = migratedDatabase()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

const call = (route: Route, email: string | false) =>
  invokeExpenseApiRoute({
    handler: route.handler,
    repo: createD1ExpenseRepository(world.env),
    env: world.env,
    url: route.url,
    method: route.method,
    params: paramsByUrl.get(route.url) ?? {},
    email,
  })

describe('the route list', () => {
  it('is read from the files and is not empty', () => {
    expect(routes.length).toBeGreaterThan(40)
    expect(routes.map((r) => r.key)).toContain('GET /api/expenses')
    expect(routes.map((r) => r.key)).toContain('DELETE /api/expenses/transactions/1')
    expect(routes.map((r) => r.key)).toContain('PATCH /api/access/admin/users/someone%40example.com/grants')
  })

  it('names only routes that exist', () => {
    const keys = new Set(routes.map((r) => r.key))
    for (const key of OPEN_TO_UNAPPROVED) expect(keys.has(key), key).toBe(true)
  })

  it('has no route file outside functions/api, where Pages would serve it with no middleware', () => {
    const served = Object.entries(elsewhere)
      .filter(([, source]) => /export\s+(const|async\s+function|function)\s+onRequest/.test(source))
      .map(([file]) => file)

    expect(served).toEqual([])
    expect(Object.keys(elsewhere).length).toBeGreaterThan(10)
  })
})

describe('with no identity', () => {
  it('every route answers 401 and reads nothing', async () => {
    world.clearLog()
    const answers: Record<string, number> = {}
    for (const route of routes) answers[route.key] = (await call(route, false)).status

    expect(Object.entries(answers).filter(([, status]) => status !== 401)).toEqual([])
    expect(world.log).toEqual([])
  })
})

describe('with an identity nobody has approved', () => {
  it('every route but the reviewed few answers 403 and reads no data', async () => {
    world.clearLog()
    const answers: Record<string, number> = {}
    for (const route of routes) {
      if (OPEN_TO_UNAPPROVED.has(route.key)) continue
      answers[route.key] = (await call(route, STRANGER)).status
    }

    expect(Object.entries(answers).filter(([, status]) => status !== 403)).toEqual([])
    expect(world.log.filter((sql) => !/allowed_users|user_group_grants/.test(sql))).toEqual([])
  })

  it('the reviewed few answer them', async () => {
    for (const route of routes.filter((r) => OPEN_TO_UNAPPROVED.has(r.key) && r.method === 'GET')) {
      expect((await call(route, STRANGER)).status, route.key).toBe(200)
    }
  })
})

describe('with an approved person who is not the owner', () => {
  it('the owner’s admin routes answer 403', async () => {
    const admin = routes.filter((r) => r.key.includes('/api/access/admin/'))

    expect(admin.length).toBeGreaterThanOrEqual(6)
    for (const route of admin) expect((await call(route, OTHER)).status, route.key).toBe(403)
  })

  it('the owner is let in to the same routes', async () => {
    const pending = routes.find((r) => r.key === 'GET /api/access/admin/pending')
    expect(pending).toBeDefined()

    expect((await call(pending as Route, OWNER)).status).toBe(200)
  })
})
