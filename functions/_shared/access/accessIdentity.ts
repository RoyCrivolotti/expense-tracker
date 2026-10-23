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
 * Whether the signed token is checked, and against what. It is off only when neither `ACCESS_TEAM_DOMAIN` nor
 * `ACCESS_AUD` is set, which keeps the app as it was. If either is set the check is meant to be on, so a pair that
 * cannot be used (one missing, a team that is not a hostname) is not read as off: that would leave the unsigned header
 * believed because of a typo.
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
 * The lowercased email of the person making the request. The unsigned `Cf-Access-Authenticated-User-Email` header
 * names them; when the Access settings are configured, the signed token must also verify and carry the same address,
 * or the request is a 401. Settings that are set but unusable refuse every request with a 503, naming the problem in
 * the log, rather than falling back to the header.
 */
export async function resolveVerifiedEmail(request: Request, env: AccessEnv, keyFor: KeyForId = accessKeys): Promise<string> {
  const check = accessCheck(env)
  if (check.state === 'misconfigured') {
    console.error(`access: ${check.problem}; refusing every request until it is fixed`)
    throw new HttpError(503, 'Sign-in checking is not set up correctly')
  }
  const email = resolveAuthenticatedEmail(request)
  if (check.state === 'off') return email
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
