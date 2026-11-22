import { createD1AccessRepository } from '../../../functions/_shared/adapters/d1AccessRepository'
import { createD1CaptureRepository } from '../../../functions/_shared/adapters/d1CaptureRepository'
import { createD1PushRepository } from '../../../functions/_shared/adapters/d1PushRepository'
import type { CaptureEnv } from './env'
import { handleCapture } from './handle'
import { notifyPayment } from './notify'
import type { CreatedPayment } from './notify'
import { serverError } from './responses'
import { runSummaries } from './summaries'

/**
 * Accepts a bank push from a person's phone and turns it into a recommendation. It serves this one route and
 * nothing else, reads nothing back, and never looks at the Access headers: the owner comes from the capture key.
 * A failure answers a fixed 500. `handleCapture` has already logged it by the error's class alone, because an
 * error built from a push would carry bank text.
 *
 * A payment that made a recommendation is announced to the person's devices after the answer is decided, inside
 * `waitUntil`, so the phone's request is never slowed or failed by it.
 */
export default {
  async fetch(
    request: Request,
    env: CaptureEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const created: CreatedPayment[] = []
    try {
      const captures = createD1CaptureRepository(env)
      const response = await handleCapture(request, env, {
        captures,
        access: createD1AccessRepository(env),
        now: () => new Date(),
        onCreated: (payment) => created.push(payment),
      })
      const push = createD1PushRepository(env)
      const countOpen = (owner: string) => captures.countOpenRecommendations(owner)
      for (const payment of created) {
        ctx.waitUntil(notifyPayment(payment, env, { push, countOpen, fetcher: fetch, now: () => new Date() }))
      }
      return response
    } catch {
      return serverError()
    }
  },

  /**
   * The hourly cron. A daily or weekly summary is due at 20:00 in the person's own zone, which Cloudflare's UTC cron
   * knows nothing of, so it runs every hour and asks per person (workers/capture/src/summaryDue.ts).
   */
  scheduled(
    controller: ScheduledController,
    env: CaptureEnv,
    ctx: ExecutionContext,
  ): void {
    ctx.waitUntil(
      runSummaries(env, {
        push: createD1PushRepository(env),
        captures: createD1CaptureRepository(env),
        fetcher: fetch,
        now: () => new Date(controller.scheduledTime),
      }),
    )
  },
}
