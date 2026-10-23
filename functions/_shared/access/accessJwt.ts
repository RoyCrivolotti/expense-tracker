import { HttpError } from '../http'

/** What the Access application is configured as: the team's hostname and the application's audience tag. */
export interface AccessJwtConfig {
  /** `<team>.cloudflareaccess.com`, no scheme. */
  teamDomain: string
  /** The Access application's AUD tag. */
  audience: string
}

/** The key a token names, or null when the team publishes none by that id. */
export type KeyForId = (teamDomain: string, keyId: string) => Promise<CryptoKey | null>

/** A token is accepted this long after `exp` and this long before `nbf`, for clocks that disagree a little. */
const LEEWAY_SECONDS = 60

/** Every refusal is the same 401 to the caller; the reason goes to the log, never the token. */
function refuse(reason: string): never {
  console.warn(`access: refused a request identity: ${reason}`)
  throw new HttpError(401, 'Not authenticated')
}

function decodeBase64Url(part: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(part)) refuse('token is not base64url')
  const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function decodeJson(part: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(decodeBase64Url(part)))
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  } catch (error) {
    if (error instanceof HttpError) throw error
  }
  return refuse('token part is not a JSON object')
}

function audiences(aud: unknown): string[] {
  if (typeof aud === 'string') return [aud]
  return Array.isArray(aud) ? aud.filter((a): a is string => typeof a === 'string') : []
}

function checkClaims(claims: Record<string, unknown>, config: AccessJwtConfig, nowSeconds: number): string {
  if (claims.iss !== `https://${config.teamDomain}`) refuse('wrong issuer')
  if (!audiences(claims.aud).includes(config.audience)) refuse('wrong audience')
  if (typeof claims.exp !== 'number' || claims.exp + LEEWAY_SECONDS < nowSeconds) refuse('token expired')
  if (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf - LEEWAY_SECONDS > nowSeconds)) {
    refuse('token not valid yet')
  }
  if (typeof claims.email !== 'string' || claims.email.trim() === '') refuse('token carries no email')
  return claims.email.trim().toLowerCase()
}

/**
 * Verifies the `Cf-Access-Jwt-Assertion` token Cloudflare Access adds to a request: RS256 only, signed by a key the
 * team publishes, for this application, from this team, not expired. Returns the lowercased email it carries. The
 * header that carries the same address unsigned is only believed when the two agree.
 */
export async function verifyAccessJwt(
  token: string,
  config: AccessJwtConfig,
  keyFor: KeyForId,
  nowSeconds: number = Date.now() / 1000,
): Promise<string> {
  const parts = token.split('.')
  if (parts.length !== 3) refuse('token does not have three parts')
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string]
  const header = decodeJson(headerPart)
  if (header.alg !== 'RS256') refuse('token is not RS256')
  if (typeof header.kid !== 'string') refuse('token names no key')
  const key = await keyFor(config.teamDomain, header.kid)
  if (!key) refuse('token names a key the team does not publish')
  const signed = new TextEncoder().encode(`${headerPart}.${payloadPart}`)
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decodeBase64Url(signaturePart), signed)
  if (!valid) refuse('signature does not match')
  return checkClaims(decodeJson(payloadPart), config, nowSeconds)
}
