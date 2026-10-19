// @vitest-environment node
/**
 * GET /api/expenses answers 304 from a per-owner revision (docs/ARCHITECTURE.md, "Dataset revision").
 * A write the revision misses is a stale 304 until the owner's next write, so these tests drive every
 * mutating route through the real middleware and a real SQLite database, and check the revision and
 * the dataset move together.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env, ExpensesData } from '../../_shared/env'
import { HttpError } from '../../_shared/http'
import { createD1ExpenseRepository } from '../../_shared/adapters/d1ExpenseRepository'
import { purgeOwnerData } from '../../_shared/ownerDataPurge'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { OTHER, OWNER, createExpenseWorld, pinClock, type World } from '../../_shared/testing/expenseWorld'
import { scenarioInput, seedLedger, uploadForm, type SeededIds } from '../../_shared/testing/seedLedger'
import { onRequestGet } from './index'

type Handler = PagesFunction<Env, string, ExpensesData>
type RouteModules = Record<string, Record<string, unknown>>

const modules = import.meta.glob<Record<string, unknown>>(['./**/*.ts', '!./**/*.test.ts'], {
  eager: true,
}) as RouteModules

const MUTATING = ['Post', 'Put', 'Patch', 'Delete'] as const

interface Route {
  /** e.g. "PATCH /transactions/:id" */
  key: string
  handler: Handler
}

function routePath(file: string): string {
  const path = file
    .replace(/^\.\//, '/')
    .replace(/\.ts$/, '')
    .replace(/\[(\w+)\]/g, ':$1')
    .replace(/\/index$/, '')
  return path === '' ? '/' : path
}

/** Every handler a route file exports for the given methods, read from the files themselves. */
function routesFor(methods: readonly string[]): Route[] {
  const routes: Route[] = []
  for (const [file, exports] of Object.entries(modules)) {
    for (const method of methods) {
      const handler = exports[`onRequest${method}`]
      if (typeof handler === 'function') {
        routes.push({ key: `${method.toUpperCase()} ${routePath(file)}`, handler: handler as Handler })
      }
    }
  }
  return routes.sort((a, b) => a.key.localeCompare(b.key))
}

interface Request {
  path: string
  params?: Record<string, string>
  body?: unknown
  rawBody?: BodyInit
}

const expense = (ids: SeededIds, day: string, description: string) => ({
  date: day,
  budgetMonth: day.slice(0, 7),
  description,
  accountId: ids.debit,
  categoryId: ids.groceries,
  type: 'expense',
  amountCents: 4_500,
  cancelled: false,
})

const id = (value: number) => ({ id: String(value) })

/**
 * One request that really changes the dataset, per mutating route. A route with no entry here fails
 * "has a case for every mutating route", so adding a route means saying how to exercise it.
 */
const CASES: Record<string, (ids: SeededIds) => Request & { status: number }> = {
  'POST /accounts': () => ({ status: 201, path: '/accounts', body: { name: 'Savings', kind: 'debit', settlement: 'immediate', active: true } }),
  'PATCH /accounts/:id': (ids) => ({ status: 200, path: `/accounts/${ids.debit}`, params: id(ids.debit), body: { name: 'Main' } }),
  'DELETE /accounts/:id': (ids) => ({ status: 200, path: `/accounts/${ids.spareAccount}`, params: id(ids.spareAccount), body: {} }),
  'POST /attachments': (ids) => ({ status: 201, path: '/attachments', rawBody: uploadForm(ids.transactions[1]!) }),
  'DELETE /attachments/:id': (ids) => ({ status: 200, path: `/attachments/${ids.attachment}`, params: id(ids.attachment) }),
  'PUT /cash-actuals': () => ({ status: 200, path: '/cash-actuals', body: { yearMonth: '2026-10', actualCashCents: 250_000 } }),
  'POST /categories': () => ({ status: 201, path: '/categories', body: { name: 'Fun', monthlyBudgetCents: 1_000, sortOrder: 9, active: true } }),
  'PATCH /categories/:id': (ids) => ({ status: 200, path: `/categories/${ids.groceries}`, params: id(ids.groceries), body: { monthlyBudgetCents: 70_000 } }),
  'DELETE /categories/:id': (ids) => ({ status: 200, path: `/categories/${ids.spareCategory}`, params: id(ids.spareCategory), body: {} }),
  'POST /flags': () => ({ status: 201, path: '/flags', body: { name: 'Gift', color: '#F43F5E', sortOrder: 9, active: true } }),
  'PATCH /flags/:id': (ids) => ({ status: 200, path: `/flags/${ids.flag}`, params: id(ids.flag), body: { name: 'Client' } }),
  'DELETE /flags/:id': (ids) => ({ status: 200, path: `/flags/${ids.spareFlag}`, params: id(ids.spareFlag) }),
  'POST /installment-plans': (ids) => ({
    status: 201,
    path: '/installment-plans',
    body: { description: 'Desk', totalCount: 2, amountCents: 20_000, accountId: ids.card, categoryId: ids.travel, type: 'expense', anchorBudgetMonth: '2026-12', startInstallmentIndex: 1, active: true },
  }),
  'PATCH /installment-plans/:id': (ids) => ({ status: 200, path: `/installment-plans/${ids.plan}`, params: id(ids.plan), body: { description: 'Couch' } }),
  'DELETE /installment-plans/:id': (ids) => ({ status: 200, path: `/installment-plans/${ids.plan}`, params: id(ids.plan) }),
  'POST /labels': () => ({ status: 201, path: '/labels', body: { name: 'Work', color: '#6366F1', sortOrder: 9, active: true } }),
  'PATCH /labels/:id': (ids) => ({ status: 200, path: `/labels/${ids.label}`, params: id(ids.label), body: { name: 'Holiday' } }),
  'DELETE /labels/:id': (ids) => ({ status: 200, path: `/labels/${ids.spareLabel}`, params: id(ids.spareLabel) }),
  'POST /scenarios': () => ({ status: 201, path: '/scenarios', body: scenarioInput({ name: 'Another' }) }),
  'PATCH /scenarios/:id': (ids) => ({ status: 200, path: `/scenarios/${ids.scenario}`, params: id(ids.scenario), body: { name: 'Renamed' } }),
  'DELETE /scenarios/:id': (ids) => ({ status: 200, path: `/scenarios/${ids.spareScenario}`, params: id(ids.spareScenario) }),
  'PUT /settings': () => ({ status: 200, path: '/settings', body: { openingCashCents: 123_400 } }),
  'PUT /statements': (ids) => ({ status: 200, path: '/statements', body: { accountId: ids.card, yearMonth: '2026-10', paid: true, paidOn: '2026-10-20' } }),
  'POST /transactions': (ids) => ({ status: 201, path: '/transactions', body: expense(ids, '2026-10-08', 'Coffee beans') }),
  'PATCH /transactions/:id': (ids) => ({ status: 200, path: `/transactions/${ids.transactions[0]}`, params: id(ids.transactions[0]!), body: { description: 'Edited' } }),
  'DELETE /transactions/:id': (ids) => ({ status: 200, path: `/transactions/${ids.spareTransaction}`, params: id(ids.spareTransaction) }),
  'PUT /transactions/:id/labels': (ids) => ({ status: 200, path: `/transactions/${ids.transactions[1]}/labels`, params: id(ids.transactions[1]!), body: { labelIds: [] } }),
  'POST /transactions/bulk/labels': (ids) => ({ status: 200, path: '/transactions/bulk/labels', body: { ids: [ids.transactions[0]], labelIds: [ids.label] } }),
  'POST /transactions/bulk': (ids) => ({ status: 201, path: '/transactions/bulk', body: { transactions: [expense(ids, '2026-10-09', 'Bulk one'), expense(ids, '2026-10-10', 'Bulk two')] } }),
  'PATCH /transactions/bulk': (ids) => ({ status: 200, path: '/transactions/bulk', body: { ids: [ids.transactions[0]], patch: { categoryId: ids.travel } } }),
  'DELETE /transactions/bulk': (ids) => ({ status: 200, path: '/transactions/bulk', body: { ids: [ids.spareTransaction] } }),
  'POST /wealth-accounts': () => ({ status: 201, path: '/wealth-accounts', body: { name: 'Pension', kind: 'investment', sortOrder: 5, archived: false } }),
  'PATCH /wealth-accounts/:id': (ids) => ({ status: 200, path: `/wealth-accounts/${ids.wealthAccount}`, params: id(ids.wealthAccount), body: { sortOrder: 4 } }),
  'DELETE /wealth-accounts/:id': (ids) => ({ status: 200, path: `/wealth-accounts/${ids.spareWealthAccount}`, params: id(ids.spareWealthAccount) }),
  'POST /wealth-checkins': (ids) => ({ status: 201, path: '/wealth-checkins', body: { checkinDate: '2026-09-01', entries: [{ accountId: ids.wealthAccount, valueCents: 6_000_000 }] } }),
  'PATCH /wealth-checkins/:id': (ids) => ({ status: 200, path: `/wealth-checkins/${ids.checkin}`, params: id(ids.checkin), body: { checkinDate: '2026-06-02' } }),
  'DELETE /wealth-checkins/:id': (ids) => ({ status: 200, path: `/wealth-checkins/${ids.spareCheckin}`, params: id(ids.spareCheckin) }),
}

const READ_CASES: Record<string, (ids: SeededIds) => Request> = {
  'GET /': () => ({ path: '' }),
  'GET /attachments': (ids) => ({ path: `/attachments?transactionId=${ids.transactions[0]}` }),
  'GET /attachments/:id': (ids) => ({ path: `/attachments/${ids.attachment}`, params: id(ids.attachment) }),
  'GET /cube': () => ({ path: '/cube?from=2026-01&to=2026-12' }),
  'GET /descriptions/suggest': () => ({ path: '/descriptions/suggest?q=ma' }),
  'GET /reference': () => ({ path: '/reference' }),
  'GET /usage': () => ({ path: '/usage' }),
  'GET /transactions/months': () => ({ path: '/transactions/months?from=2026-01&to=2026-12' }),
  'GET /series': () => ({ path: '/series' }),
  'GET /transactions/list': () => ({ path: '/transactions/list' }),
  'GET /transactions/summary': () => ({ path: '/transactions/summary' }),
  'GET /transactions/:id': (ids) => ({
    path: `/transactions/${ids.spareTransaction}`,
    params: id(ids.spareTransaction),
  }),
}

async function getDataset(world: World, headers?: Record<string, string>) {
  const response = await world.call(onRequestGet, { ...(headers ? { headers } : {}) })
  return { response, etag: response.headers.get('etag'), text: await response.text() }
}

function createWorld(): World {
  const sqlite = migratedDatabase()
  return createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
}

let world: World
let ids: SeededIds

beforeEach(async () => {
  pinClock('2026-10-15')
  world = createWorld()
  ids = await seedLedger(world)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the revision moves with every write route', () => {
  it('has a case for every mutating route, and none for a route that is gone', () => {
    const routes = routesFor(MUTATING).map((r) => r.key)
    expect(routes.length).toBeGreaterThan(30)
    expect(Object.keys(CASES).sort()).toEqual(routes)
  })

  it('has no catch-all handler that would take a write without a case', () => {
    const catchAll = Object.entries(modules)
      .filter(([, exports]) => typeof exports['onRequest'] === 'function')
      .map(([file]) => file)
    expect(catchAll).toEqual([])
  })

  const mutating = routesFor(MUTATING)
  it.each(mutating.map((route) => [route.key, route] as const))(
    '%s changes the ETag and the dataset',
    async (key, route) => {
      const before = await getDataset(world)
      const tokenBefore = world.token()

      const request = CASES[key]!(ids)
      const response = await world.call(route.handler, {
        method: key.split(' ')[0]!,
        path: request.path,
        ...(request.params ? { params: request.params } : {}),
        ...(request.body !== undefined ? { body: request.body } : {}),
        ...(request.rawBody !== undefined ? { rawBody: request.rawBody } : {}),
      })
      expect(response.status, await response.clone().text()).toBe(request.status)

      const after = await getDataset(world)
      expect(world.token()).not.toBe(tokenBefore)
      expect(after.etag).not.toBe(before.etag)
      expect(after.text).not.toBe(before.text)
    },
  )
})

describe('a read never moves the revision', () => {
  it('has a case for every read route, so a GET that writes is noticed', () => {
    const reads = routesFor(['Get', 'Head', 'Options']).map((r) => r.key)
    expect(Object.keys(READ_CASES).sort()).toEqual(reads)
  })

  const reads = routesFor(['Get'])
  it.each(reads.map((route) => [route.key, route] as const))('%s leaves the ETag alone', async (key, route) => {
    const before = await getDataset(world)
    const tokenBefore = world.token()
    const request = READ_CASES[key]!(ids)

    const response = await world.call(route.handler, {
      path: request.path,
      ...(request.params ? { params: request.params } : {}),
    })
    expect(response.status).toBe(200)

    const after = await getDataset(world)
    expect(world.token()).toBe(tokenBefore)
    expect(after.etag).toBe(before.etag)
    expect(after.text).toBe(before.text)
  })

  it('leaves it alone for HEAD and OPTIONS', async () => {
    const handler: Handler = () => new Response('ok')
    const tokenBefore = world.token()
    for (const method of ['HEAD', 'OPTIONS']) {
      const response = await world.call(handler, { method })
      expect(response.status).toBe(200)
    }
    expect(world.token()).toBe(tokenBefore)
  })
})

describe('the token a write replaced', () => {
  const seeing = (record: (value: unknown) => void): Handler => (context) => {
    record(context.data.revisionBeforeWrite)
    return new Response('ok')
  }

  it('reaches the handler, so a write can tell whether the ledger moved since it was looked at', async () => {
    const before = world.token()
    let seen: unknown = 'unset'

    await world.call(seeing((value) => (seen = value)), { method: 'PATCH', path: '/anything' })

    expect(before).not.toBeNull()
    expect(seen).toBe(before)
    expect(world.token()).not.toBe(before)
  })

  it('is the token the previous write left behind', async () => {
    const first = world.token()
    let seen: unknown = 'unset'
    await world.call(seeing(() => undefined), { method: 'POST', path: '/anything' })
    const second = world.token()

    await world.call(seeing((value) => (seen = value)), { method: 'POST', path: '/anything' })

    expect(seen).toBe(second)
    expect(seen).not.toBe(first)
  })

  it('is null for an owner who has no token yet', async () => {
    let seen: unknown = 'unset'
    expect(world.token(OTHER)).toBeNull()

    await world.call(seeing((value) => (seen = value)), { method: 'POST', path: '/anything', email: OTHER })

    expect(seen).toBeNull()
    expect(world.token(OTHER)).not.toBeNull()
  })

  it('is not read for a request that cannot write', async () => {
    let seen: unknown = 'unset'
    world.clearLog()

    await world.call(seeing((value) => (seen = value)), { path: '/anything' })

    expect(seen).toBeUndefined()
    expect(world.log.some((sql) => sql.includes('FROM owner_revision'))).toBe(false)
  })
})

describe('the bumps around a write', () => {
  /** Runs a handler that records the token it saw, so the order of bump, handler, bump shows. */
  async function writeSeeing(handler: (seen: () => string | null) => Handler, method = 'POST') {
    const before = world.token()
    let during: string | null = null
    const response = await world.call(
      handler(() => {
        during = world.token()
        return during
      }),
      { method, path: '/anything' },
    )
    return { before, during, after: world.token(), response }
  }

  it('moves the token before the handler runs and again after it', async () => {
    const { before, during, after, response } = await writeSeeing((seen) => () => {
      seen()
      return new Response('ok')
    })
    expect(response.status).toBe(200)
    expect(during).not.toBe(before)
    expect(after).not.toBe(during)
  })

  it('moves it again after a handler that throws, since the write may already have landed', async () => {
    const { during, after, response } = await writeSeeing((seen) => () => {
      seen()
      throw new HttpError(409, 'Already settled')
    })
    expect(response.status).toBe(409)
    expect(after).not.toBe(during)
  })

  it('moves it again after a handler that answers with an error', async () => {
    const { during, after, response } = await writeSeeing((seen) => () => {
      seen()
      return new Response('nope', { status: 400 })
    })
    expect(response.status).toBe(400)
    expect(after).not.toBe(during)
  })

  it('tries the bump after the write twice, because one failure leaves a stale copy valid', async () => {
    let bumps = 0
    world.intercept((sql) => {
      if (sql.includes('INSERT INTO owner_revision') && ++bumps === 2) throw new Error('D1 network lost')
    })
    const { during, after, response } = await writeSeeing((seen) => () => {
      seen()
      return new Response('ok')
    })
    expect(response.status).toBe(200)
    expect(bumps).toBe(3)
    expect(after).not.toBe(during)
  })

  it('fails the request when the bump after a write fails twice', async () => {
    let bumps = 0
    world.intercept((sql) => {
      if (sql.includes('INSERT INTO owner_revision') && ++bumps >= 2) throw new Error('D1 is down')
    })
    const { response } = await writeSeeing((seen) => () => {
      seen()
      return new Response('ok')
    })
    expect(response.status).toBe(500)
  })

  it('does not run the handler when the bump before it fails', async () => {
    world.intercept((sql) => {
      if (sql.includes('INSERT INTO owner_revision')) throw new Error('D1 is down')
    })
    let ran = false
    const response = await world.call(
      () => {
        ran = true
        return new Response('ok')
      },
      { method: 'POST' },
    )
    expect(response.status).toBe(500)
    expect(ran).toBe(false)
  })

  it('keeps the handler error when the bump after it fails as well', async () => {
    let bumps = 0
    world.intercept((sql) => {
      if (sql.includes('INSERT INTO owner_revision') && ++bumps >= 2) throw new Error('D1 is down')
    })
    const { response } = await writeSeeing((seen) => () => {
      seen()
      throw new HttpError(409, 'Already settled')
    })
    expect(response.status).toBe(409)
  })
})

describe('GET /api/expenses', () => {
  it('sends the dataset unchanged, with a weak ETag and no-cache', async () => {
    const { response, etag, text } = await getDataset(world)

    expect(response.status).toBe(200)
    expect(etag).toMatch(/^W\/"[0-9a-f]{16}-2026-10-\d+"$/)
    expect(response.headers.get('cache-control')).toBe('private, no-cache')
    const expected = await createD1ExpenseRepository(world.env).loadDataset(OWNER)
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(expected)))
  })

  it('answers a matching If-None-Match with 304, an empty body and the same headers', async () => {
    const { etag } = await getDataset(world)

    const { response, text } = await getDataset(world, { 'if-none-match': etag! })

    expect(response.status).toBe(304)
    expect(text).toBe('')
    expect(response.headers.get('etag')).toBe(etag)
    expect(response.headers.get('cache-control')).toBe('private, no-cache')
  })

  it('answers 304 when the browser sends the tag among others', async () => {
    const { etag } = await getDataset(world)

    const { response } = await getDataset(world, { 'if-none-match': `W/"nope", ${etag}` })

    expect(response.status).toBe(304)
  })

  it('reads nothing but the revision for a 304: no dataset query and no backfill', async () => {
    const { etag } = await getDataset(world)
    world.clearLog()

    const { response } = await getDataset(world, { 'if-none-match': etag! })

    expect(response.status).toBe(304)
    const beyondAuth = world.log.filter((sql) => !/allowed_users|user_group_grants/.test(sql))
    expect(beyondAuth).toHaveLength(1)
    expect(beyondAuth[0]).toContain('owner_revision')
  })

  it('runs the whole load for a 200, for contrast', async () => {
    world.clearLog()

    await getDataset(world)

    const beyondAuth = world.log.filter((sql) => !/allowed_users|user_group_grants/.test(sql))
    expect(beyondAuth.length).toBeGreaterThan(10)
  })

  it('sends the whole dataset again to a browser holding the tag from before a write', async () => {
    const { etag: stale } = await getDataset(world)
    const write = await world.call(
      (await import('./settings/index')).onRequestPut,
      { method: 'PUT', path: '/settings', body: { openingCashCents: 777_700 } },
    )
    expect(write.status).toBe(200)

    const { response, etag, text } = await getDataset(world, { 'if-none-match': stale! })

    expect(response.status).toBe(200)
    expect(etag).not.toBe(stale)
    expect(JSON.parse(text).settings.openingCashCents).toBe(777_700)
  })

  it('never matches a tag the other owner holds, even with the same data and the same clock', async () => {
    const mine = await getDataset(world)

    const theirs = await getDataset(world, {})
    expect(theirs.etag).toBe(mine.etag)

    const other = await world.call(onRequestGet, { email: OTHER, headers: { 'if-none-match': mine.etag! } })
    expect(other.status).toBe(200)
    expect(other.headers.get('etag')).not.toBe(mine.etag)
  })

  it('gives two owners who have done nothing different tags', async () => {
    const first = await world.call(onRequestGet, { email: OTHER })
    const fresh = createWorld()
    const second = await fresh.call(onRequestGet, { email: OTHER })

    expect(first.headers.get('etag')).not.toBe(second.headers.get('etag'))
  })

  it('creates the revision on the first read and keeps it after', async () => {
    expect(world.token(OTHER)).toBeNull()

    const first = await world.call(onRequestGet, { email: OTHER })
    const token = world.token(OTHER)
    const second = await world.call(onRequestGet, { email: OTHER })

    expect(token).not.toBeNull()
    expect(world.token(OTHER)).toBe(token)
    expect(second.headers.get('etag')).toBe(first.headers.get('etag'))
  })
})

describe('the budget month is part of the tag', () => {
  it('changes at the turn of the month with no write, and the installment that falls due comes with it', async () => {
    const { etag: october } = await getDataset(world)
    expect((await getDataset(world, { 'if-none-match': october! })).response.status).toBe(304)

    pinClock('2026-11-02')
    const november = await getDataset(world, { 'if-none-match': october! })

    expect(november.response.status).toBe(200)
    expect(november.etag).not.toBe(october)
    expect(november.etag).toContain('-2026-11-')
    const sofa = JSON.parse(november.text).transactions.filter(
      (t: { planId?: number }) => t.planId === ids.plan,
    )
    expect(sofa).toHaveLength(1)
  })

  it('changes on the owner’s rollover day, not the calendar month', async () => {
    const put = await world.call((await import('./settings/index')).onRequestPut, {
      method: 'PUT',
      path: '/settings',
      body: { budgetRolloverDay: 15 },
    })
    expect(put.status).toBe(200)
    pinClock('2026-10-14')
    const before = await getDataset(world)
    expect(before.etag).toContain('-2026-10-')
    expect((await getDataset(world, { 'if-none-match': before.etag! })).response.status).toBe(304)

    pinClock('2026-10-15')
    const after = await getDataset(world, { 'if-none-match': before.etag! })

    expect(after.response.status).toBe(200)
    expect(after.etag).toContain('-2026-11-')
  })

  it('settles after one more load once a rollover has backfilled rows', async () => {
    const { etag: october } = await getDataset(world)
    pinClock('2026-11-02')
    const first = await getDataset(world, { 'if-none-match': october! })
    // The backfill moved the revision after the tag was read, so the tag sent with the rows is already
    // behind. Sending it would be wrong the other way round (a newer tag on older data).
    const second = await getDataset(world, { 'if-none-match': first.etag! })
    const third = await getDataset(world, { 'if-none-match': second.etag! })

    expect([first.response.status, second.response.status, third.response.status]).toEqual([200, 200, 304])
  })
})

describe('the installment backfill, the one write that happens on a read', () => {
  it('moves the revision when it inserted a row', async () => {
    pinClock('2026-11-02')
    const before = world.token()

    await getDataset(world)

    expect(world.token()).not.toBe(before)
  })

  it('moves it once however many rows it inserted', async () => {
    pinClock('2027-03-02')
    const before = world.token()
    let bumps = 0
    world.intercept((sql) => {
      if (sql.includes('INSERT INTO owner_revision')) bumps += 1
    })

    const { text } = await getDataset(world)

    const sofa = JSON.parse(text).transactions.filter((t: { planId?: number }) => t.planId === ids.plan)
    expect(sofa).toHaveLength(3)
    expect(bumps).toBe(1)
    expect(world.token()).not.toBe(before)
  })

  it('leaves it alone when nothing was due', async () => {
    const before = world.token()

    await getDataset(world)
    await getDataset(world)

    expect(world.token()).toBe(before)
  })

  it('leaves it alone the second time, when the rows are already there', async () => {
    pinClock('2026-11-02')
    await getDataset(world)
    const after = world.token()

    await getDataset(world)

    expect(world.token()).toBe(after)
  })

  it('moves it on the path the backup takes, which does not go through the route', async () => {
    pinClock('2026-11-02')
    const before = world.token()
    const repo = createD1ExpenseRepository(world.env)

    await repo.loadDataset(OWNER)
    const once = world.token()
    await repo.loadDataset(OWNER)

    expect(once).not.toBe(before)
    expect(world.token()).toBe(once)
  })
})

describe('removing an owner', () => {
  it('deletes the revision, and a browser holding the old tag gets a full 200 if they come back', async () => {
    const { etag: old } = await getDataset(world)
    expect(world.token()).not.toBeNull()

    await purgeOwnerData(world.env, OWNER)
    expect(world.token()).toBeNull()

    const { response, etag } = await getDataset(world, { 'if-none-match': old! })
    expect(response.status).toBe(200)
    expect(etag).not.toBe(old)
  })
})
