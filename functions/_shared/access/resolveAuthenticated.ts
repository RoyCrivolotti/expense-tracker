import { HttpError } from '../http'

const ACCESS_EMAIL_HEADER = 'Cf-Access-Authenticated-User-Email'

/** Lowercased email from Cloudflare Access, or 401 when missing. */
export function resolveAuthenticatedEmail(request: Request): string {
  const email = request.headers.get(ACCESS_EMAIL_HEADER)
  if (!email?.trim()) throw new HttpError(401, 'Not authenticated')
  return email.trim().toLowerCase()
}
