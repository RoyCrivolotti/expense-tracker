import { resolveAuthenticatedEmail } from '../access/resolveAuthenticated'
import type { AuthConfig, AuthProvider } from '../../domain/ports/authProvider'
import { HttpError } from '../http'

/** Cloudflare Access adapter — reads the authenticated-user header Access injects. */
export const cloudflareAccessAuth: AuthProvider = {
  resolveUser(request, _config: AuthConfig) {
    try {
      return resolveAuthenticatedEmail(request)
    } catch (e) {
      if (e instanceof HttpError) throw e
      throw new HttpError(401, 'Not authenticated')
    }
  },
}
