import { interpretPush, parseCaptureKey } from '../../../src/domain/capture'
import type { AccessRepository } from '../../../src/domain/ports/accessRepository'
import type { CaptureRepository } from '../../../src/domain/ports/captureRepository'
import { authenticate, bearerKey } from './authenticate'
import { readCappedText } from './body'
import type { RawPush } from '../../../src/domain/capture'
import type { CaptureKey } from '../../../src/domain/ports/captureRepository'
import type { CaptureEnv } from './env'
import { consoleLogger } from './log'
import type { CaptureLogLine, CaptureLogger } from './log'
import { DAILY_CAPS, MAX_BODY_BYTES, captureCaps } from './limits'
import { parsePush } from './parsePush'
import * as reply from './responses'
import { storeRecognised } from './store'

export interface CaptureDeps {
  captures: CaptureRepository
  access: AccessRepository
  now: () => Date
  /** Where the one line per request goes. The console when absent. */
  log?: CaptureLogger
}

/** The only path the Worker answers on. Matched exactly: no trailing slash, no sub-path, no encoded spelling. */
export const CAPTURE_PATH = '/capture'

/**
 * Refusals that need no database, in the order they are made: the method, the exact path, the key's shape, the
 * declared size and the content type. A request that fails any of them costs no database call.
 */
function cheapRefusal(request: Request): { response: Response; reason: string } | null {
  if (new URL(request.url).pathname !== CAPTURE_PATH) return { response: reply.notFound(), reason: 'wrong-path' }
  if (request.method !== 'POST') return { response: reply.methodNotAllowed(), reason: 'wrong-method' }
  if (bearerKey(request) === null) return { response: reply.unauthorized(), reason: 'no-valid-key-header' }
  const declared = request.headers.get('content-length')
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) return { response: reply.tooLarge(), reason: 'body-too-large' }
  const type = request.headers.get('content-type') ?? ''
  if (!/^application\/json\s*(;|$)/i.test(type)) return { response: reply.unsupportedType(), reason: 'not-json' }
  return null
}

/**
 * Answers a push and writes one log line about it, whatever happened. A thrown error is logged by its class alone and
 * then thrown again for the caller to turn into the fixed 500.
 */
export async function handleCapture(request: Request, env: CaptureEnv, deps: CaptureDeps): Promise<Response> {
  const started = Date.now()
  const log = deps.log ?? consoleLogger
  const line: CaptureLogLine = { event: 'capture', outcome: 'refused', reason: 'unknown', status: 0, ms: 0 }
  try {
    const response = await run(request, env, deps, line)
    line.status = response.status
    line.ms = Date.now() - started
    log(line)
    return response
  } catch (e) {
    line.outcome = 'error'
    line.reason = 'exception'
    line.status = 500
    line.errorName = e instanceof Error ? e.name : 'unknown'
    line.ms = Date.now() - started
    log(line)
    throw e
  }
}

async function run(request: Request, env: CaptureEnv, deps: CaptureDeps, line: CaptureLogLine): Promise<Response> {
  const refused = cheapRefusal(request)
  if (refused) {
    line.reason = refused.reason
    return refused.response
  }
  const secret = env.CAPTURE_REPLAY_SECRET
  if (!secret) {
    line.reason = 'not-configured'
    return reply.unavailable()
  }

  const bearer = bearerKey(request) as string
  const parts = parseCaptureKey(bearer)
  if (parts) line.keyId = parts.keyId
  const key = await authenticate(bearer, env, deps.captures, deps.access)
  if (!key) {
    line.reason = 'key-rejected'
    return reply.unauthorized()
  }

  const text = await readCappedText(request, MAX_BODY_BYTES)
  if (text === null) {
    line.reason = 'body-too-large'
    return reply.tooLarge()
  }
  const push = parsePush(text)
  if (!push) {
    line.reason = 'bad-body'
    return reply.badRequest()
  }
  line.source = push.source

  return admitAndStore(push, key, secret, deps, line)
}

/** Counts the push against the caps, then stores what it becomes or counts it as unrecognised. */
async function admitAndStore(push: RawPush, key: CaptureKey, secret: string, deps: CaptureDeps, line: CaptureLogLine): Promise<Response> {
  const now = deps.now()
  const day = now.toISOString().slice(0, 10)
  const admitted = await deps.captures.admit(key.owner, push.source, day, DAILY_CAPS)
  if (admitted === 'sources') {
    line.outcome = 'limited'
    line.reason = 'too-many-sources'
    return reply.tooManySources()
  }
  if (admitted === 'limited') {
    line.outcome = 'limited'
    line.reason = 'daily-cap'
    return reply.tooManyRequests()
  }
  // Best effort: a missed update only shows an older "last used" time, and must not lose the push.
  await deps.captures.touchKey(key.keyId, now.toISOString()).catch(() => undefined)

  const result = interpretPush(push, now.getTime())
  if (result.outcome !== 'recommend') {
    await deps.captures.bumpCounter(key.owner, push.source, day, 'unrecognised')
    line.outcome = 'dropped'
    line.reason = result.outcome === 'dropped' ? 'no-matching-kind' : result.reason
    return reply.ok()
  }
  line.kind = result.kind
  line.amount = result.amountCents === null ? 'none' : 'read'
  const stored = await storeRecognised(deps.captures, key, push, result, secret, now, captureCaps(now))
  if (stored === 'limited') {
    line.outcome = 'limited'
    line.reason = 'recommendation-cap'
    return reply.tooManyRequests()
  }
  line.outcome = stored === 'replay' ? 'replay' : 'stored'
  line.reason = stored
  return reply.ok()
}
