import type { Env } from '../env'
import { HttpError } from '../http'
import { accessKeys, normalizeTeamDomain } from './accessKeys'
import { verifyAccessJwt, type AccessJwtConfig, type KeyForId } from './accessJwt'
import { resolveAuthenticatedEmail } from './resolveAuthenticated'

const JWT_HEADER = 'Cf-Access-Jwt-Assertion'

let warnedOfPartialConfig = false

/**
 * The team and application to check tokens against, or null when checking is off. It is on only when both
 * `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are set; with neither, requests are identified by the header alone, as before.
 * With one of them set, checking stays off and the log says so once, rather than taking the app down over half a setting.
 */
export function accessJwtConfig(env: Pick<Env, 'ACCESS_TEAM_DOMAIN' | 'ACCESS_AUD'>): AccessJwtConfig | null {
  const rawTeam = env.ACCESS_TEAM_DOMAIN?.trim() ?? ''
  const audience = env.ACCESS_AUD?.trim() ?? ''
  if (rawTeam === '' && audience === '') return null
  const teamDomain = normalizeTeamDomain(rawTeam)
  if (teamDomain === null || audience === '') {
    if (!warnedOfPartialConfig) {
      warnedOfPartialConfig = true
      console.warn('access: ACCESS_TEAM_DOMAIN and ACCESS_AUD must both be set (and the domain a hostname); not checking tokens')
    }
    return null
  }
  return { teamDomain, audience }
}

/**
 * The lowercased email of the person making the request. The unsigned `Cf-Access-Authenticated-User-Email` header
 * names them; when the Access settings are configured, the signed token must also verify and carry the same address,
 * or the request is a 401.
 */
export async function resolveVerifiedEmail(
  request: Request,
  env: Pick<Env, 'ACCESS_TEAM_DOMAIN' | 'ACCESS_AUD'>,
  keyFor: KeyForId = accessKeys,
): Promise<string> {
  const email = resolveAuthenticatedEmail(request)
  const config = accessJwtConfig(env)
  if (!config) return email
  const token = request.headers.get(JWT_HEADER)
  if (!token?.trim()) {
    console.warn('access: refused a request with no signed identity')
    throw new HttpError(401, 'Not authenticated')
  }
  const signed = await verifyAccessJwt(token.trim(), config, keyFor)
  if (signed !== email) {
    console.warn('access: refused a request whose header and signed identity name different people')
    throw new HttpError(401, 'Not authenticated')
  }
  return email
}
