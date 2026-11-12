import { isEmailAllowed, requireExpensesGroupGrant } from '../../../functions/_shared/access/accessAuthorizer'
import { HttpError } from '../../../functions/_shared/http'
import type { AccessRepository } from '../../../src/domain/ports/accessRepository'
import type { CaptureKey, CaptureRepository } from '../../../src/domain/ports/captureRepository'
import { parseCaptureKey, secretMatches } from '../../../src/domain/capture'
import type { CaptureEnv } from './env'

const BEARER = /^Bearer (xpk_[0-9a-f]{16}_[0-9a-f]{64})$/

/** Compared against when the id is unknown, so a miss takes about as long as a wrong secret. */
const DUMMY_HASH = '0'.repeat(64)

/**
 * The text of a well-formed `Authorization: Bearer <key>` header, or null. Two headers arrive joined with a comma and
 * fail the pattern, as does any other scheme. Nothing here touches the database.
 */
export function bearerKey(request: Request): string | null {
  const match = BEARER.exec(request.headers.get('authorization') ?? '')
  return match ? (match[1] as string) : null
}

async function stillAllowed(access: AccessRepository, env: CaptureEnv, owner: string): Promise<boolean> {
  try {
    if (!(await isEmailAllowed(access, env, owner))) return false
    await requireExpensesGroupGrant(access, env, owner)
    return true
  } catch (e) {
    // The authorizer says no by throwing 403. Any other failure is the database's, and must not read as a no.
    if (e instanceof HttpError && e.status === 403) return false
    throw e
  }
}

/**
 * The key row for a well-formed key that is live and whose owner may still use the app, or null for every other
 * reason. Which reason is never told apart. A database failure throws, so it is never answered as a success.
 */
export async function authenticate(
  key: string,
  env: CaptureEnv,
  captures: CaptureRepository,
  access: AccessRepository,
): Promise<CaptureKey | null> {
  const parts = parseCaptureKey(key)
  if (!parts) return null
  const row = await captures.findKey(parts.keyId)
  const matched = await secretMatches(row?.secretHash ?? DUMMY_HASH, parts.secret)
  if (!row || !matched || row.revokedAt !== null) return null
  return (await stillAllowed(access, env, row.owner)) ? row : null
}
