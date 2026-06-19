import type { AuthProvider } from '../../domain/ports/authProvider'
import { HttpError } from '../http'

const ACCESS_EMAIL_HEADER = 'Cf-Access-Authenticated-User-Email'

/** Cloudflare Access adapter — reads the authenticated-user header Access injects. */
export const cloudflareAccessAuth: AuthProvider = {
  resolveUser(request, config) {
    const email = request.headers.get(ACCESS_EMAIL_HEADER)
    if (!email) throw new HttpError(401, 'Not authenticated')
    const owner = email.trim().toLowerCase()

    const allow = (config.allowedEmails ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
    if (allow.length > 0 && !allow.includes(owner)) {
      throw new HttpError(403, 'Not authorised')
    }
    return owner
  },
}
