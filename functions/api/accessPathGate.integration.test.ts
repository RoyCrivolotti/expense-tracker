// @vitest-environment node
/**
 * Which /api/access routes the middleware lets through without the allow-list: the four a person needs before they
 * have been approved, and the owner's admin routes (owner only). Any other route under /api/access is behind the
 * allow-list like the expense routes.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { migratedDatabase, newStats, sqliteD1 } from '../../src/testing/sqliteD1'
import { OTHER, OWNER, createExpenseWorld, type World } from '../_shared/testing/expenseWorld'
import { onRequestGet as getStatus } from './access/status'
import { onRequestGet as getGroups } from './access/groups'
import { onRequestGet as getGrants } from './access/grants'
import { onRequestGet as getPending } from './access/admin/pending'

const STRANGER = 'stranger@example.com'

let world: World

beforeAll(() => {
  const sqlite = migratedDatabase()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
})

const reached: PagesFunction = () => Promise.resolve(Response.json({ reached: true }))
/** `world.call` prefixes /api/expenses, so `/..` steps back out to /api/access. */
const as = (email: string, path: string, handler: Parameters<World['call']>[0] = reached) =>
  world.call(handler, { path: `/../access${path}`, email })

describe('a person Access has signed in but nobody approved', () => {
  it.each([
    ['status', getStatus],
    ['groups', getGroups],
    ['grants', getGrants],
  ])('can read /api/access/%s', async (name, handler) => {
    const response = await as(STRANGER, `/${name}`, handler)

    expect(response.status).toBe(200)
  })

  it('can read the same route with a trailing slash', async () => {
    expect((await as(STRANGER, '/status/', getStatus)).status).toBe(200)
  })

  it('is refused by a route under /api/access that is not on the list', async () => {
    for (const path of ['/new-route', '/status/extra', '/statuses', '/requests']) {
      const response = await as(STRANGER, path)

      expect(response.status, path).toBe(403)
      expect(await response.json(), path).toEqual({ error: 'Not authorised' })
    }
  })
})

describe('the admin routes', () => {
  it('refuse an approved person who is not the owner, before the route runs', async () => {
    for (const path of ['/admin/pending', '/admin/anything-new']) {
      expect((await as(OTHER, path)).status, path).toBe(403)
    }
  })

  it('refuse a person who is not on the allow-list', async () => {
    expect((await as(STRANGER, '/admin/pending', getPending)).status).toBe(403)
  })

  it('let the owner reach a route under them', async () => {
    expect(await (await as(OWNER, '/admin/anything-new')).json()).toEqual({ reached: true })
  })

  it('refuse everyone when no owner is configured', async () => {
    const owner = world.env.OWNER_EMAIL
    delete world.env.OWNER_EMAIL
    try {
      expect((await as(OWNER, '/admin/pending')).status).toBe(503)
    } finally {
      world.env.OWNER_EMAIL = owner
    }
  })
})
