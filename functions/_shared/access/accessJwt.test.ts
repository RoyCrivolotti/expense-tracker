// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUD, TEAM, base64Url, claimsFor, createIdp, generateKeyPair, type Idp } from '../testing/accessIdp'
import { verifyAccessJwt, type AccessJwtConfig, type KeyForId } from './accessJwt'

const CONFIG: AccessJwtConfig = { teamDomain: TEAM, audience: AUD }
const NOW = 1_800_000_000

let idp: Idp
let publicKey: CryptoKey
let keyFor: KeyForId

beforeAll(async () => {
  idp = await createIdp('key-1')
  publicKey = idp.keyPair.publicKey
})

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  keyFor = (_team, id) => Promise.resolve(id === 'key-1' ? publicKey : null)
})

const claims = (over: Record<string, unknown> = {}) => claimsFor('Roy@Example.com', over, NOW)
const verify = (token: string, now = NOW) => verifyAccessJwt(token, CONFIG, keyFor, now)
const refused = async (token: string) => verify(token).then(() => null, (error: { status: number }) => error.status)

describe('a token Access signed for this application', () => {
  it('gives the email it carries, lowercased', async () => {
    expect(await verify(await idp.sign(claims()))).toBe('roy@example.com')
  })

  it('may name the application as a single string', async () => {
    expect(await verify(await idp.sign(claims({ aud: AUD })))).toBe('roy@example.com')
  })

  it('may name several applications, this one among them', async () => {
    expect(await verify(await idp.sign(claims({ aud: ['other', AUD] })))).toBe('roy@example.com')
  })

  it('is accepted a little after it expires and a little before it starts, for clocks that disagree', async () => {
    expect(await verify(await idp.sign(claims({ exp: NOW - 30 })))).toBe('roy@example.com')
    expect(await verify(await idp.sign(claims({ nbf: NOW + 30 })))).toBe('roy@example.com')
  })
})

describe('a token that is refused with a 401', () => {
  it('is for another application', async () => {
    expect(await refused(await idp.sign(claims({ aud: ['someone-elses'] })))).toBe(401)
    expect(await refused(await idp.sign(claims({ aud: [] })))).toBe(401)
    expect(await refused(await idp.sign(claims({ aud: undefined })))).toBe(401)
  })

  it('is from another team', async () => {
    expect(await refused(await idp.sign(claims({ iss: 'https://other.cloudflareaccess.com' })))).toBe(401)
    expect(await refused(await idp.sign(claims({ iss: TEAM })))).toBe(401)
  })

  it('has expired', async () => {
    expect(await refused(await idp.sign(claims({ exp: NOW - 61 })))).toBe(401)
    expect(await refused(await idp.sign(claims({ exp: undefined })))).toBe(401)
    expect(await refused(await idp.sign(claims({ exp: 'soon' })))).toBe(401)
  })

  it('is not valid yet', async () => {
    expect(await refused(await idp.sign(claims({ nbf: NOW + 61 })))).toBe(401)
    expect(await refused(await idp.sign(claims({ nbf: 'later' })))).toBe(401)
  })

  it('carries no email', async () => {
    expect(await refused(await idp.sign(claims({ email: undefined })))).toBe(401)
    expect(await refused(await idp.sign(claims({ email: '  ' })))).toBe(401)
    expect(await refused(await idp.sign(claims({ email: 7 })))).toBe(401)
  })

  it('was signed by a key that is not the team’s, whatever id it gives', async () => {
    const stranger = await generateKeyPair()

    expect(await refused(await idp.sign(claims(), { key: stranger.privateKey }))).toBe(401)
  })

  it('names a key the team does not publish', async () => {
    expect(await refused(await idp.sign(claims(), { kid: 'key-9' }))).toBe(401)
  })

  it('has had its claims changed after it was signed', async () => {
    const token = await idp.sign(claims())
    const [header, , signature] = token.split('.') as [string, string, string]
    const forged = `${header}.${base64Url(JSON.stringify(claims({ email: 'owner@example.com' })))}.${signature}`

    expect(await refused(forged)).toBe(401)
  })

  it('has a signature that was cut short or damaged', async () => {
    const token = await idp.sign(claims())

    expect(await refused(token.slice(0, -4))).toBe(401)
    expect(await refused(`${token.slice(0, -4)}AAAA`)).toBe(401)
    expect(await refused(await idp.sign(claims(), { signature: '' }))).toBe(401)
  })

  it('is not RS256, whatever else it looks like', async () => {
    expect(await refused(await idp.sign(claims(), { alg: 'none', signature: '' }))).toBe(401)
    expect(await refused(await idp.sign(claims(), { alg: 'HS256' }))).toBe(401)
    expect(await refused(await idp.sign(claims(), { alg: 'RS384' }))).toBe(401)
  })

  it.each(['', 'abc', 'a.b', 'a.b.c.d', '..', '!!!.???.***', `${base64Url('[]')}.${base64Url('{}')}.x`, `${base64Url('{"alg":"RS256"}')}.${base64Url('{}')}.x`])(
    'is not a token: %j',
    async (token) => {
      expect(await refused(token)).toBe(401)
    },
  )

  it('is a valid token with something after it', async () => {
    expect(await refused(`${await idp.sign(claims())}.extra`)).toBe(401)
  })

  it('names no key, and asks for none', async () => {
    const asked = vi.fn(keyFor)

    const error = await verifyAccessJwt(await idp.sign(claims(), { kid: null }), CONFIG, asked, NOW).catch((e: { status: number }) => e)

    expect((error as { status: number }).status).toBe(401)
    expect(asked).not.toHaveBeenCalled()
  })

  it('never reaches the signature check for a token that is not RS256', async () => {
    const asked = vi.fn(keyFor)

    await verifyAccessJwt(await idp.sign(claims(), { alg: 'HS256' }), CONFIG, asked, NOW).catch(() => undefined)

    expect(asked).not.toHaveBeenCalled()
  })

  it('does not say why to the caller, and does not log the token', async () => {
    const warn = vi.spyOn(console, 'warn')
    const token = await idp.sign(claims({ aud: ['x'] }))

    const error = await verify(token).catch((e: Error) => e)

    expect((error as Error).message).toBe('Not authenticated')
    expect(warn.mock.calls.flat().join(' ')).not.toContain(token.split('.')[2])
  })
})
