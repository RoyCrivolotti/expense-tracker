import { cloudflareAccessAuth } from './adapters/cloudflareAccessAuth'
import type { Env } from './env'

/** @deprecated Prefer resolveAuthenticatedEmail; kept for tests and legacy call sites. */
export function requireUser(request: Request, _env: Env): string {
  return cloudflareAccessAuth.resolveUser(request, {})
}
