// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUD, TEAM, claimsFor, createIdp, type Idp } from '../testing/accessIdp'
import { accessCheck, resolveVerifiedEmail } from './accessIdentity'
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

describe('accessCheck', () => {
  it('is off with neither setting, blank or not given', () => {
    expect(accessCheck({})).toEqual({ state: 'off' })
    expect(accessCheck({ ACCESS_TEAM_DOMAIN: ' ', ACCESS_AUD: '' })).toEqual({ state: 'off' })
    expect(accessCheck({ ACCESS_TEAM_DOMAIN: '\t', ACCESS_AUD: '  ' })).toEqual({ state: 'off' })
  })

  it('is on with both, the domain as a bare hostname', () => {
    expect(accessCheck({ ACCESS_TEAM_DOMAIN: 'https://ACME.cloudflareaccess.com/', ACCESS_AUD: ` ${AUD} ` })).toEqual({
      state: 'on',
      config: { teamDomain: TEAM, audience: AUD },
    })
  })

  it.each([
    ['only the team domain', { ACCESS_TEAM_DOMAIN: TEAM }, 'ACCESS_TEAM_DOMAIN is set but ACCESS_AUD is not'],
    ['the team domain and a blank tag', { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: '  ' }, 'ACCESS_TEAM_DOMAIN is set but ACCESS_AUD is not'],
    ['only the tag', { ACCESS_AUD: AUD }, 'ACCESS_AUD is set but ACCESS_TEAM_DOMAIN is not'],
    ['a blank team domain and a tag', { ACCESS_TEAM_DOMAIN: ' ', ACCESS_AUD: AUD }, 'ACCESS_AUD is set but ACCESS_TEAM_DOMAIN is not'],
  ])('is misconfigured with %s', (_name, env, problem) => {
    expect(accessCheck(env)).toEqual({ state: 'misconfigured', problem })
  })

  it.each(['acme', 'acme.cloudflareaccess.com/path', 'acme.cloudflareaccess.com:8443', 'http://acme.cloudflareaccess.com', 'a b.com', 'user@example.com', '.com'])(
    'is misconfigured with the team domain %j, which is not a hostname',
    (team) => {
      const check = accessCheck({ ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: AUD })

      expect(check.state).toBe('misconfigured')
      expect(check).toMatchObject({ problem: expect.stringContaining('ACCESS_TEAM_DOMAIN must be a hostname') })
    },
  )

  it('never repeats a value in what it says', () => {
    const check = accessCheck({ ACCESS_TEAM_DOMAIN: 'http://secret-team.example', ACCESS_AUD: AUD })

    expect(JSON.stringify(check)).not.toContain('secret-team')
    expect(JSON.stringify(check)).not.toContain(AUD)
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

describe('the person making a request, with settings that are set and cannot be used', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  const BROKEN: Array<[string, { ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string }]> = [
    ['only the team domain', { ACCESS_TEAM_DOMAIN: TEAM }],
    ['only the tag', { ACCESS_AUD: AUD }],
    ['the team name alone', { ACCESS_TEAM_DOMAIN: 'acme', ACCESS_AUD: AUD }],
    ['a team domain with a path', { ACCESS_TEAM_DOMAIN: `${TEAM}/cdn-cgi`, ACCESS_AUD: AUD }],
    ['a team domain with a port', { ACCESS_TEAM_DOMAIN: `${TEAM}:443`, ACCESS_AUD: AUD }],
    ['a team domain with http://', { ACCESS_TEAM_DOMAIN: `http://${TEAM}`, ACCESS_AUD: AUD }],
  ]

  it.each(BROKEN)('refuses every request, a forged header included: %s', async (_name, env) => {
    expect(await outcome(request('owner@example.com', null), env)).toBe(503)
    expect(await outcome(request('owner@example.com', 'garbage'), env)).toBe(503)
    expect(await outcome(request('owner@example.com', await idp.sign(claimsFor('owner@example.com'))), env)).toBe(503)
    expect(await outcome(request(null, null), env)).toBe(503)
  })

  it('says which setting is wrong in the log, and nothing else of it', async () => {
    await outcome(request('owner@example.com', null), { ACCESS_TEAM_DOMAIN: 'acme', ACCESS_AUD: AUD })

    const logged = vi.mocked(console.error).mock.calls.flat().join(' ')
    expect(logged).toContain('ACCESS_TEAM_DOMAIN must be a hostname')
    expect(logged).not.toContain(AUD)
  })

  it('does not ask the team for its keys', async () => {
    const asked = vi.fn(keyFor)

    await resolveVerifiedEmail(request('owner@example.com', null), { ACCESS_AUD: AUD }, asked).catch(() => undefined)

    expect(asked).not.toHaveBeenCalled()
  })
})
