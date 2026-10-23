// @vitest-environment node
/**
 * The /api middleware with the Access settings on: every request must carry a signed token that verifies and names the
 * same person as the header, or it is a 401, whichever route it is for. With them off nothing changes.
 */
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { accessKeys } from '../_shared/access/accessKeys'
import { AUD, TEAM, certsFetch, claimsFor, createIdp, generateKeyPair, type CertsFetch, type Idp } from '../_shared/testing/accessIdp'
import { migratedDatabase, newStats, sqliteD1 } from '../../src/testing/sqliteD1'
import { OWNER, OTHER, createExpenseWorld, pinClock, type World } from '../_shared/testing/expenseWorld'
import { seedLedger, type SeededIds } from '../_shared/testing/seedLedger'
import { onRequestGet as getStatus } from './access/status'
import { onRequestGet as getDataset } from './expenses/index'
import { onRequestGet as getOne, onRequestDelete as deleteOne } from './expenses/transactions/[id]'

let idp: Idp
let certs: CertsFetch
let world: World
let sqlite: DatabaseSync
let ids: SeededIds

beforeAll(async () => {
  idp = await createIdp('key-1')
})

beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  pinClock('2026-10-15')
  accessKeys.clear()
  certs = certsFetch([idp])
  vi.stubGlobal('fetch', certs.fetch)
  sqlite = migratedDatabase()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  ids = await seedLedger(world)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const turnOn = () => {
  world.env.ACCESS_TEAM_DOMAIN = TEAM
  world.env.ACCESS_AUD = AUD
}
const token = (email = OWNER, over: Record<string, unknown> = {}) => idp.sign(claimsFor(email, over))
const one = (headers: Record<string, string>, email = OWNER) =>
  world.call(getOne, { path: `/transactions/${ids.transactions[0]}`, params: { id: String(ids.transactions[0]) }, headers, email })

describe('with the Access settings off', () => {
  it('a request is identified by the header alone, whatever token it carries, and no key is fetched', async () => {
    expect((await one({})).status).toBe(200)
    expect((await one({ 'cf-access-jwt-assertion': 'garbage' })).status).toBe(200)
    expect(certs.calls()).toBe(0)
  })

  it('with both blank', async () => {
    world.env.ACCESS_TEAM_DOMAIN = ' '
    world.env.ACCESS_AUD = ''

    expect((await one({})).status).toBe(200)
  })
})

describe('with the Access settings set and unusable', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  const forged = { 'cf-access-jwt-assertion': 'x' }

  it.each([
    ['only the tag', { ACCESS_AUD: AUD }],
    ['only the team domain', { ACCESS_TEAM_DOMAIN: TEAM }],
    ['the team name alone', { ACCESS_TEAM_DOMAIN: 'acme', ACCESS_AUD: AUD }],
    ['a path', { ACCESS_TEAM_DOMAIN: `${TEAM}/x`, ACCESS_AUD: AUD }],
    ['a port', { ACCESS_TEAM_DOMAIN: `${TEAM}:8443`, ACCESS_AUD: AUD }],
    ['http://', { ACCESS_TEAM_DOMAIN: `http://${TEAM}`, ACCESS_AUD: AUD }],
  ])('every route is a 503 and a forged header gets nothing: %s', async (_name, env) => {
    Object.assign(world.env, env)

    const read = await one(forged)
    const write = await world.call(deleteOne, { method: 'DELETE', path: `/transactions/${ids.spareTransaction}`, params: { id: String(ids.spareTransaction) }, headers: forged })

    expect(read.status).toBe(503)
    expect(await read.json()).toEqual({ error: 'Sign-in checking is not set up correctly' })
    expect(write.status).toBe(503)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM transactions WHERE id = ?').get(ids.spareTransaction)).toEqual({ n: 1 })
    expect(certs.calls()).toBe(0)
  })
})

describe('with the Access settings on', () => {
  beforeEach(turnOn)

  it('a request whose token verifies and names the person in the header goes through', async () => {
    const response = await one({ 'cf-access-jwt-assertion': await token() })

    expect(response.status).toBe(200)
  })

  it('every kind of route is checked, the access routes and the expense routes, reads and writes', async () => {
    const jwt = await token()
    const bad = { 'cf-access-jwt-assertion': await token(OWNER, { aud: ['elsewhere'] }) }

    expect((await world.call(getStatus, { headers: { 'cf-access-jwt-assertion': jwt } })).status).toBe(200)
    expect((await world.call(getStatus, { headers: bad })).status).toBe(401)
    expect((await world.call(getDataset, { headers: bad })).status).toBe(401)
    const write = await world.call(deleteOne, { method: 'DELETE', path: `/transactions/${ids.spareTransaction}`, params: { id: String(ids.spareTransaction) }, headers: bad })
    expect(write.status).toBe(401)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM transactions WHERE id = ?').get(ids.spareTransaction)).toEqual({ n: 1 })
  })

  it('a request with no token is a 401', async () => {
    expect((await one({})).status).toBe(401)
  })

  it('a request with a token for another application is a 401', async () => {
    expect((await one({ 'cf-access-jwt-assertion': await token(OWNER, { aud: ['elsewhere'] }) })).status).toBe(401)
  })

  it('an expired token is a 401', async () => {
    expect((await one({ 'cf-access-jwt-assertion': await token(OWNER, { exp: Date.now() / 1000 - 3600 }) })).status).toBe(401)
  })

  it('a token signed by another key is a 401', async () => {
    const stranger = await generateKeyPair()

    expect((await one({ 'cf-access-jwt-assertion': await idp.sign(claimsFor(OWNER), { key: stranger.privateKey }) })).status).toBe(401)
  })

  it('a header changed after the token was issued is a 401: someone else’s address with the owner’s token', async () => {
    const owners = await token(OWNER)

    const response = await one({ 'cf-access-jwt-assertion': owners }, OTHER)

    expect(response.status).toBe(401)
  })

  it('and the owner’s address with someone else’s token', async () => {
    expect((await one({ 'cf-access-jwt-assertion': await token(OTHER) }, OWNER)).status).toBe(401)
  })

  it('a 401 says nothing of why', async () => {
    const response = await one({})

    expect(await response.json()).toEqual({ error: 'Not authenticated' })
  })

  it('the team’s keys are fetched once for many requests', async () => {
    for (let i = 0; i < 5; i += 1) await one({ 'cf-access-jwt-assertion': await token() })

    expect(certs.calls()).toBe(1)
  })

  it('a request is a 503 when the keys cannot be had, not let through', async () => {
    certs.failWith(500)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await one({ 'cf-access-jwt-assertion': await token() })

    expect(response.status).toBe(503)
  })

  it('a refusal reaches no data: nothing is read for the owner before the identity is checked', async () => {
    world.clearLog()

    await one({})

    expect(world.log.filter((sql) => /FROM transactions|allowed_users|owner_revision/.test(sql))).toEqual([])
  })
})
