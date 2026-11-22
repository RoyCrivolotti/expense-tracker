import type { CaptureRepository, OpenSummary } from '../../../src/domain/ports/captureRepository'
import type { SummaryPerson } from '../../../src/domain/ports/pushRepository'
import type { CaptureEnv } from './env'
import { deliver, vapidKeysOf } from './notify'
import type { Attempt, SendDeps } from './notify'
import { consolePushLogger } from './pushLog'
import type { PushLogLine, PushLogger } from './pushLog'
import { summaryState } from './summaryDue'

export interface SummaryDeps extends SendDeps {
  captures: Pick<CaptureRepository, 'summarizeOpen'>
  log?: PushLogger
}

/** One summary of what is waiting: `Topic` is fixed so a phone that was off gets the latest one only. */
const SUMMARY_TOPIC = 'review-summary'

/** What the service worker in `src/sw/push.ts` reads. One open payment opens its own form, several open the list. */
export function summaryPayload(summary: OpenSummary): string {
  return JSON.stringify({
    v: 1,
    kind: 'summary',
    url: summary.onlyId ? `/?review=${summary.onlyId}` : '/',
    count: summary.count,
    ...(summary.totalCents !== null && summary.currency
      ? { totalCents: summary.totalCents, currency: summary.currency }
      : {}),
    open: summary.count,
  })
}

/**
 * The hourly cron's work: sends the daily and weekly summaries that have come due. Never throws, and a failure for one
 * person or device never stops the others. A person with nothing waiting or no device is skipped without being marked,
 * so a payment that arrives later in the evening still gets its summary. The mark is made before the send, by a single
 * compare-and-set, so two runs cannot both send; a send that then fails is not retried, as for a payment.
 */
export async function runSummaries(
  env: CaptureEnv,
  deps: SummaryDeps,
): Promise<void> {
  const log = deps.log ?? consolePushLogger
  const started = Date.now()
  const line = (
    attempt: Attempt,
    devices: number,
  ): void => log({ event: 'push', ...attempt, devices, ms: Date.now() - started })
  const skipped = (
    reason: PushLogLine['reason'],
    devices = 0,
  ): void => line({ outcome: 'skipped', reason, status: 0 }, devices)
  try {
    const keys = vapidKeysOf(env)
    if (!keys) return skipped('not-configured')
    const now = deps.now()
    for (const person of await deps.push.listSummaryPeople()) {
      try {
        await summarize(person, now, keys, deps, line, skipped)
      } catch {
        line({ outcome: 'failed', reason: 'exception', status: 0 }, 0)
      }
    }
  } catch {
    line({ outcome: 'failed', reason: 'exception', status: 0 }, 0)
  }
}

async function summarize(
  person: SummaryPerson,
  now: Date,
  keys: NonNullable<ReturnType<typeof vapidKeysOf>>,
  deps: SummaryDeps,
  line: (
    attempt: Attempt,
    devices: number,
  ) => void,
  skipped: (
    reason: PushLogLine['reason'],
    devices?: number,
  ) => void,
): Promise<void> {
  const state = summaryState(person, now)
  if (state === 'invalid-zone') return skipped('invalid-zone')
  if (state !== 'due') return
  const summary = await deps.captures.summarizeOpen(person.owner)
  if (summary.count === 0) return skipped('nothing-waiting')
  const targets = await deps.push.listTargets(person.owner)
  if (targets.length === 0) return skipped('no-devices')
  if (!(await deps.push.claimSummary(person.owner, person.lastSummaryAt, now.toISOString()))) {
    return skipped('already-sent', targets.length)
  }
  await deliver(person.owner, targets, summaryPayload(summary), SUMMARY_TOPIC, keys, deps, line)
}
