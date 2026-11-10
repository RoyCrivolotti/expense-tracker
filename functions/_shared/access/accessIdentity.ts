import type { Env } from '../env'
import { HttpError } from '../http'
import { accessKeys, normalizeTeamDomain } from './accessKeys'
import { verifyAccessJwt, type AccessJwtConfig, type KeyForId } from './accessJwt'
import { resolveAuthenticatedEmail } from './resolveAuthenticated'

const JWT_HEADER = 'Cf-Access-Jwt-Assertion'

type AccessEnv = Pick<Env, 'ACCESS_TEAM_DOMAIN' | 'ACCESS_AUD'>

export type AccessCheck =
  | { state: 'off' }
  | { state: 'on'; config: AccessJwtConfig }
  /** One of the settings is set and the pair cannot be used; `problem` says which and why, without the values. */
  | { state: 'misconfigured'; problem: string }

/**
 * Whether the signed token is checked, and against what. `off` means neither `ACCESS_TEAM_DOMAIN` nor `ACCESS_AUD` is
 * set; `resolveVerifiedEmail` then answers only a request to a local development host. If either is set the check is
 * meant to be on, so a pair that cannot be used (one missing, a team that is not a hostname) is not read as off: that
 * would leave the unsigned header believed because of a typo.
 */
export function accessCheck(env: AccessEnv): AccessCheck {
  const rawTeam = env.ACCESS_TEAM_DOMAIN?.trim() ?? ''
  const audience = env.ACCESS_AUD?.trim() ?? ''
  if (rawTeam === '' && audience === '') return { state: 'off' }
  if (rawTeam === '') return { state: 'misconfigured', problem: 'ACCESS_AUD is set but ACCESS_TEAM_DOMAIN is not' }
  if (audience === '') return { state: 'misconfigured', problem: 'ACCESS_TEAM_DOMAIN is set but ACCESS_AUD is not' }
  const teamDomain = normalizeTeamDomain(rawTeam)
  if (teamDomain === null) {
    return {
      state: 'misconfigured',
      problem: 'ACCESS_TEAM_DOMAIN must be a hostname such as acme.cloudflareaccess.com, with no path, port or http://',
    }
  }
  return { state: 'on', config: { teamDomain, audience } }
}

/**
 * Local development, where Cloudflare Access does not run and the header is set by hand. A deployed request reaches
 * this code only through a hostname Cloudflare routes to the project, so the request's host is never one of these.
 */
export function isLocalDevelopmentHost(request: Request): boolean {
  const { hostname } = new URL(request.url)
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/**
 * The lowercased email of the person making the request. The unsigned `Cf-Access-Authenticated-User-Email` header
 * names them, and anyone who reaches the app without passing Access can write it, so it is believed only after the
 * signed token has been checked: it must verify and carry the same address, or the request is a 401.
 *
 * With the settings missing or blank the app has nothing to check the token against and fails closed: every request
 * is a 503, except one to a local development host, which is identified by the header alone. Settings that are set but
 * unusable are a 503 too. Either way the log names the problem and the response says nothing of it.
 */
export async function resolveVerifiedEmail(request: Request, env: AccessEnv, keyFor: KeyForId = accessKeys): Promise<string> {
  const check = accessCheck(env)
  if (check.state === 'misconfigured') {
    console.error(`access: ${check.problem}; refusing every request until it is fixed`)
    throw new HttpError(503, 'Sign-in checking is not set up correctly')
  }
  if (check.state === 'off') {
    if (isLocalDevelopmentHost(request)) return resolveAuthenticatedEmail(request)
    console.error('access: ACCESS_TEAM_DOMAIN and ACCESS_AUD are not set; refusing every request until they are')
    throw new HttpError(503, 'Sign-in checking is not set up correctly')
  }
  const email = resolveAuthenticatedEmail(request)
  const token = request.headers.get(JWT_HEADER)
  if (!token?.trim()) {
    console.warn('access: refused a request with no signed identity')
    throw new HttpError(401, 'Not authenticated')
  }
  const signed = await verifyAccessJwt(token.trim(), check.config, keyFor)
  if (signed !== email) {
    console.warn('access: refused a request whose header and signed identity name different people')
    throw new HttpError(401, 'Not authenticated')
  }
  return email
}
