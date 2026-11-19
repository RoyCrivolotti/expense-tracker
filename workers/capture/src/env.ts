import type { Env } from '../../../functions/_shared/env'

/**
 * What the capture Worker is given. It has the database and the allow-list settings the app reads, and no receipts
 * bucket, no Access settings and no backups: it serves one route and reads nothing back.
 */
export type CaptureEnv = Pick<Env, 'DB' | 'ALLOWED_EMAILS' | 'ALLOW_BOOTSTRAP' | 'OWNER_EMAIL'> & {
  /**
   * Keys the hash that identifies a replayed push, so a stored hash cannot be matched against a guessed body such
   * as a one-time code. Unset means the Worker refuses every request with a 503 rather than store a bare digest.
   */
  CAPTURE_REPLAY_SECRET?: string
  /**
   * The deployment's VAPID key pair (RFC 8292): the private scalar (the `d` of the key's JWK), the public point and a
   * URL naming the operator, all base64url or plain text, all secrets. With any unset the Worker captures as before
   * and sends no push. See docs/PUSH.md.
   */
  VAPID_PRIVATE_KEY?: string
  VAPID_PUBLIC_KEY?: string
  VAPID_SUBJECT?: string
}
