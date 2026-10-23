// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUD, TEAM, claimsFor, createIdp, type Idp } from '../testing/accessIdp'
import { accessJwtConfig, resolveVerifiedEmail } from './accessIdentity'
import type { KeyForId } from './accessJwt'

let idp: Idp
let keyFor: KeyForId
const ON = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD }

beforeAll(async () => {
  idp = await createIdp('key-1')
})

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  keyFor = (_team, id) => Promise.resolve(id === 'key-1' ? idp.keyPair.publicKey : null)
})

function request(email: string | null, token: string | null): Request {
  const headers = new Headers()
  if (email !== null) headers.set('Cf-Access-Authenticated-User-Email', email)
  if (token !== null) headers.set('Cf-Access-Jwt-Assertion', token)
  return new Request('https://expenses.test/api/expenses', { headers })
}

const outcome = (r: Request, env = ON) => resolveVerifiedEmail(r, env, keyFor).then((email) => email, (e: { status: number }) => e.status)

describe('accessJwtConfig', () => {
  it('is off with neither setting', () => {
    expect(accessJwtConfig({})).toBeNull()
    expect(accessJwtConfig({ ACCESS_TEAM_DOMAIN: ' ', ACCESS_AUD: '' })).toBeNull()
  })

  it('is on with both, the domain as a bare hostname', () => {
    expect(accessJwtConfig({ ACCESS_TEAM_DOMAIN: 'https://ACME.cloudflareaccess.com/', ACCESS_AUD: ` ${AUD} ` })).toEqual({ teamDomain: TEAM, audience: AUD })
  })

  it('stays off with one of them, or a domain that is not a hostname, and says so', () => {
    expect(accessJwtConfig({ ACCESS_TEAM_DOMAIN: TEAM })).toBeNull()
    expect(accessJwtConfig({ ACCESS_AUD: AUD })).toBeNull()
    expect(accessJwtConfig({ ACCESS_TEAM_DOMAIN: 'acme', ACCESS_AUD: AUD })).toBeNull()
    expect(console.warn).toHaveBeenCalledTimes(1)
  })
})

describe('the person making a request, with the settings off', () => {
  it('is the person the header names, as it always was', async () => {
    expect(await outcome(request('Roy@Example.com', null), {})).toBe('roy@example.com')
  })

  it('does not look at a token, good or bad', async () => {
    expect(await outcome(request('roy@example.com', 'garbage'), {})).toBe('roy@example.com')
    expect(await outcome(request('roy@example.com', await idp.sign(claimsFor('someone@example.net'))), {})).toBe('roy@example.com')
  })

  it('is a 401 with no header', async () => {
    expect(await outcome(request(null, null), {})).toBe(401)
  })

  it('is as before with only one setting', async () => {
    expect(await outcome(request('roy@example.com', null), { ACCESS_TEAM_DOMAIN: TEAM })).toBe('roy@example.com')
  })
})

describe('the person making a request, with the settings on', () => {
  it('is the person the header names when the signed token names the same one', async () => {
    expect(await outcome(request('Roy@Example.com', await idp.sign(claimsFor('roy@example.com'))))).toBe('roy@example.com')
  })

  it('is a 401 with no token', async () => {
    expect(await outcome(request('roy@example.com', null))).toBe(401)
    expect(await outcome(request('roy@example.com', '  '))).toBe(401)
  })

  it('is a 401 when the header names someone else than the token does', async () => {
    expect(await outcome(request('owner@example.com', await idp.sign(claimsFor('roy@example.com'))))).toBe(401)
  })

  it('is a 401 with a token but no header', async () => {
    expect(await outcome(request(null, await idp.sign(claimsFor('roy@example.com'))))).toBe(401)
  })

  it('is a 401 for a token for another application, an expired one and one signed by another key', async () => {
    expect(await outcome(request('roy@example.com', await idp.sign(claimsFor('roy@example.com', { aud: ['x'] }))))).toBe(401)
    expect(await outcome(request('roy@example.com', await idp.sign(claimsFor('roy@example.com', { exp: Date.now() / 1000 - 600 }))))).toBe(401)
    expect(await outcome(request('roy@example.com', await idp.sign(claimsFor('roy@example.com'), { kid: 'key-2' })))).toBe(401)
  })

  it('trims the token, as a proxy may leave a space', async () => {
    expect(await outcome(request('roy@example.com', ` ${await idp.sign(claimsFor('roy@example.com'))} `))).toBe('roy@example.com')
  })
})
