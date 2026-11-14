import { interpretPush } from '../../../src/domain/capture'
import type { AccessRepository } from '../../../src/domain/ports/accessRepository'
import type { CaptureRepository } from '../../../src/domain/ports/captureRepository'
import { authenticate, bearerKey } from './authenticate'
import { readCappedText } from './body'
import type { CaptureEnv } from './env'
import { DAILY_CAPS, MAX_BODY_BYTES, captureCaps } from './limits'
import { parsePush } from './parsePush'
import * as reply from './responses'
import { storeRecognised } from './store'

export interface CaptureDeps {
  captures: CaptureRepository
  access: AccessRepository
  now: () => Date
}

/** The only path the Worker answers on. Matched exactly: no trailing slash, no sub-path, no encoded spelling. */
export const CAPTURE_PATH = '/capture'

/**
 * Refusals that need no database, in the order they are made: the method, the exact path, the key's shape, the
 * declared size and the content type. A request that fails any of them costs no database call.
 */
function cheapRefusal(request: Request): Response | null {
  if (new URL(request.url).pathname !== CAPTURE_PATH) return reply.notFound()
  if (request.method !== 'POST') return reply.methodNotAllowed()
  if (bearerKey(request) === null) return reply.unauthorized()
  const declared = request.headers.get('content-length')
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) return reply.tooLarge()
  const type = request.headers.get('content-type') ?? ''
  if (!/^application\/json\s*(;|$)/i.test(type)) return reply.unsupportedType()
  return null
}

export async function handleCapture(request: Request, env: CaptureEnv, deps: CaptureDeps): Promise<Response> {
  const refused = cheapRefusal(request)
  if (refused) return refused
  const secret = env.CAPTURE_REPLAY_SECRET
  if (!secret) return reply.unavailable()

  const key = await authenticate(bearerKey(request) as string, env, deps.captures, deps.access)
  if (!key) return reply.unauthorized()

  const text = await readCappedText(request, MAX_BODY_BYTES)
  if (text === null) return reply.tooLarge()
  const push = parsePush(text)
  if (!push) return reply.badRequest()

  const now = deps.now()
  const day = now.toISOString().slice(0, 10)
  const admitted = await deps.captures.admit(key.owner, push.source, day, DAILY_CAPS)
  if (admitted === 'sources') return reply.tooManySources()
  if (admitted === 'limited') return reply.tooManyRequests()
  // Best effort: a missed update only shows an older "last used" time, and must not lose the push.
  await deps.captures.touchKey(key.keyId, now.toISOString()).catch(() => undefined)

  const result = interpretPush(push, now.getTime())
  if (result.outcome !== 'recommend') {
    await deps.captures.bumpCounter(key.owner, push.source, day, 'unrecognised')
    return reply.ok()
  }
  const stored = await storeRecognised(deps.captures, key, push, result, secret, now, captureCaps(now))
  return stored === 'limited' ? reply.tooManyRequests() : reply.ok()
}
