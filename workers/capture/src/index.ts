import { createD1AccessRepository } from '../../../functions/_shared/adapters/d1AccessRepository'
import { createD1CaptureRepository } from '../../../functions/_shared/adapters/d1CaptureRepository'
import type { CaptureEnv } from './env'
import { handleCapture } from './handle'
import { serverError } from './responses'

/**
 * Accepts a bank push from a person's phone and turns it into a recommendation. It serves this one route and
 * nothing else, reads nothing back, and never looks at the Access headers: the owner comes from the capture key.
 * A failure answers a fixed 500 and logs a fixed line, because an error built from a push would carry bank text.
 */
export default {
  async fetch(request: Request, env: CaptureEnv): Promise<Response> {
    try {
      return await handleCapture(request, env, {
        captures: createD1CaptureRepository(env),
        access: createD1AccessRepository(env),
        now: () => new Date(),
      })
    } catch {
      console.error('capture: request failed')
      return serverError()
    }
  },
}
