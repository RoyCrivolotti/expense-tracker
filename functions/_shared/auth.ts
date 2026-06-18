import type { Env } from './env'
import { HttpError } from './http'

/**
 * The whole roy-admin domain sits behind Cloudflare Access, which injects the
 * authenticated email. We require it (defence in depth) and, if an allow-list is
 * configured, enforce membership. The returned email is normalised to lowercase
 * so it can be used as the stable per-user data owner key.
 */
export function requireUser(request: Request, env: Env): string {
  const email = request.headers.get('Cf-Access-Authenticated-User-Email')
  if (!email) throw new HttpError(401, 'Not authenticated')
  const owner = email.trim().toLowerCase()

  const allow = (env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (allow.length > 0 && !allow.includes(owner)) {
    throw new HttpError(403, 'Not authorised')
  }
  return owner
}
