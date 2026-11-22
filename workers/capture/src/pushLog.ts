/**
 * The one line per push attempt. Only labels go in: never the endpoint, the keys, the owner or any text of the payment,
 * since a log is not covered by the app's own access rules.
 */
export type PushReason =
  | 'ok'
  /** The push service no longer knows the device (404 or 410): its row was deleted. */
  | 'expired'
  | 'push-service-error'
  | 'network'
  /** The push service did not answer in time. */
  | 'timeout'
  | 'not-configured'
  | 'no-devices'
  /** The person asked for a daily or weekly summary rather than a push per payment. */
  | 'summary-mode'
  /** Nothing is waiting for review, so a summary would say nothing. */
  | 'nothing-waiting'
  /** The person's stored zone is not one the platform knows, so their evening cannot be told. */
  | 'invalid-zone'
  /** Another cron run claimed this person's summary first. */
  | 'already-sent'
  | 'exception'

export interface PushLogLine {
  event: 'push'
  outcome: 'sent' | 'gone' | 'failed' | 'skipped'
  reason: PushReason
  /** The push service's answer, or 0 when there was none. */
  status: number
  /** How many devices the person has. */
  devices: number
  ms: number
}

export type PushLogger = (line: PushLogLine) => void

// eslint-disable-next-line no-console
export const consolePushLogger: PushLogger = (line) => console.log(line)
