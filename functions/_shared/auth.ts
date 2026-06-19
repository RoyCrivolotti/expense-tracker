import { cloudflareAccessAuth } from './adapters/cloudflareAccessAuth'
import type { Env } from './env'

/** @deprecated Prefer {@link cloudflareAccessAuth} directly; kept for existing call sites. */
export function requireUser(request: Request, env: Env): string {
  return cloudflareAccessAuth.resolveUser(request, { allowedEmails: env.ALLOWED_EMAILS })
}
