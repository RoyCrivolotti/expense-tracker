// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TEAM, certsFetch, createIdp, type CertsFetch, type Idp } from '../testing/accessIdp'
import { createAccessKeyCache, normalizeTeamDomain } from './accessKeys'

const HOUR = 60 * 60 * 1000

let idp: Idp
let rotated: Idp
let clock: number
let certs: CertsFetch

beforeAll(async () => {
  idp = await createIdp('key-1')
  rotated = await createIdp('key-2')
})

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  clock = 1_000_000
  certs = certsFetch([idp])
})

afterEach(() => {
  vi.restoreAllMocks()
})

const cache = () => createAccessKeyCache({ fetch: certs.fetch, now: () => clock })

describe('the keys of the team', () => {
  it('are fetched once and then kept, for the keys already held and for one that is not', async () => {
    const keyFor = cache()

    expect(await keyFor(TEAM, 'key-1')).not.toBeNull()
    expect(await keyFor(TEAM, 'key-1')).not.toBeNull()
    expect(certs.calls()).toBe(1)
  })

  it('are fetched by one request when several arrive together', async () => {
    const keyFor = cache()

    await Promise.all([keyFor(TEAM, 'key-1'), keyFor(TEAM, 'key-1'), keyFor(TEAM, 'key-1')])

    expect(certs.calls()).toBe(1)
  })

  it('are fetched again after an hour', async () => {
    const keyFor = cache()
    await keyFor(TEAM, 'key-1')

    clock += HOUR + 1
    await keyFor(TEAM, 'key-1')

    expect(certs.calls()).toBe(2)
  })

  it('are fetched again for a key that is not held, but not more than once a minute', async () => {
    const keyFor = cache()
    await keyFor(TEAM, 'key-1')

    expect(await keyFor(TEAM, 'key-2')).toBeNull()
    expect(certs.calls()).toBe(1)

    clock += 61_000
    certs.serve([idp, rotated])
    expect(await keyFor(TEAM, 'key-2')).not.toBeNull()
    expect(certs.calls()).toBe(2)

    expect(await keyFor(TEAM, 'key-3')).toBeNull()
    expect(await keyFor(TEAM, 'key-3')).toBeNull()
    expect(certs.calls()).toBe(2)
  })

  it('go on being used when a fetch fails and some are held', async () => {
    const keyFor = cache()
    await keyFor(TEAM, 'key-1')
    certs.failWith(500)

    clock += HOUR + 1

    expect(await keyFor(TEAM, 'key-1')).not.toBeNull()
  })

  it('cannot be had when the first fetch fails, which is a 503 and not a way in', async () => {
    certs.failWith(500)

    await expect(cache()(TEAM, 'key-1')).rejects.toMatchObject({ status: 503 })
  })

  it('are fetched again after a failure, not remembered as missing', async () => {
    const keyFor = cache()
    certs.failWith(500)
    await keyFor(TEAM, 'key-1').catch(() => undefined)

    certs.failWith(null)

    expect(await keyFor(TEAM, 'key-1')).not.toBeNull()
  })

  it('are held per team', async () => {
    const keyFor = cache()
    await keyFor(TEAM, 'key-1')

    await expect(keyFor('other.cloudflareaccess.com', 'key-1')).rejects.toMatchObject({ status: 503 })
  })

  it('are only the RSA keys that import', async () => {
    const odd = {
      fetch: (async () =>
        new Response(JSON.stringify({ keys: [{ kid: 'a', kty: 'EC', crv: 'P-256' }, { kid: 'b', kty: 'RSA' }, { kty: 'RSA', n: 'x', e: 'AQAB' }, ...(await idp.certs()).keys] }))) as typeof fetch,
    }

    const keyFor = createAccessKeyCache({ ...odd, now: () => clock })

    expect(await keyFor(TEAM, 'key-1')).not.toBeNull()
    expect(await keyFor(TEAM, 'a')).toBeNull()
    expect(await keyFor(TEAM, 'b')).toBeNull()
  })

  it('leave out a key the platform will not import, and keep the others', async () => {
    const real = crypto.subtle.importKey.bind(crypto.subtle)
    const certsOf = async () => [{ ...(await idp.certs()).keys[0], kid: 'broken' }, ...(await idp.certs()).keys]
    const served = { fetch: (async () => new Response(JSON.stringify({ keys: await certsOf() }))) as typeof fetch }
    vi.spyOn(crypto.subtle, 'importKey').mockImplementationOnce(() => Promise.reject(new Error('bad key')))
    vi.spyOn(crypto.subtle, 'importKey').mockImplementation(real as typeof crypto.subtle.importKey)

    const keyFor = createAccessKeyCache({ ...served, now: () => clock })

    expect(await keyFor(TEAM, 'broken')).toBeNull()
    expect(await keyFor(TEAM, 'key-1')).not.toBeNull()
  })

  it('are a 503 when the document holds no usable key', async () => {
    const empty = { fetch: (async () => new Response(JSON.stringify({ keys: [] }))) as typeof fetch }

    await expect(createAccessKeyCache({ ...empty, now: () => clock })(TEAM, 'key-1')).rejects.toMatchObject({ status: 503 })
  })
})

describe('normalizeTeamDomain', () => {
  it.each([
    ['acme.cloudflareaccess.com', 'acme.cloudflareaccess.com'],
    [' ACME.cloudflareaccess.com ', 'acme.cloudflareaccess.com'],
    ['https://acme.cloudflareaccess.com', 'acme.cloudflareaccess.com'],
    ['https://acme.cloudflareaccess.com/', 'acme.cloudflareaccess.com'],
  ])('reads %j as %j', (raw, host) => {
    expect(normalizeTeamDomain(raw)).toBe(host)
  })

  it.each(['', 'acme', 'http://acme.cloudflareaccess.com', 'acme.cloudflareaccess.com/path', 'acme.cloudflareaccess.com:8443', 'a b.com', '-acme.com', 'acme..com', 'user@example.com', '/cdn-cgi'])(
    'refuses %j',
    (raw) => {
      expect(normalizeTeamDomain(raw)).toBeNull()
    },
  )
})
