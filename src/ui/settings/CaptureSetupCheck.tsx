import type { SourceStatus } from '../../data/captureStatusApi'
import { lastCaptureText, overall, sourceState, type SourceState } from './captureSetup'
import styles from './CaptureSetupSetting.module.css'
import type { useCaptureSetup } from './useCaptureSetup'

const WAITING_TITLE: Record<SourceState, string> = {
  ok: 'Last payment captured',
  quiet: 'Nothing captured lately',
  unrecognised: 'Arriving, not read as a payment',
  waiting: 'Waiting for your first payment',
}

function lastText(status: SourceStatus | undefined): string {
  return status?.lastCaptureAt
    ? `Last payment captured ${lastCaptureText(status.lastCaptureAt, new Date())}, from ${status.source}.`
    : ''
}

/** Requests the shortcut sent that the app could not read. Counts only: the request itself is never kept. */
function Unreadable({ count }: { count: number }) {
  if (count === 0) return null
  const requests = count === 1 ? '1 request' : `${count} requests`
  return (
    <p className={styles.warn}>
      {requests} from your shortcut in the last 7 days could not be read: check its fields. If your bank app&rsquo;s
      name has no Latin letters or digits, add a <b>source</b> field with a short name you type, such as <b>mybank</b>.
    </p>
  )
}

function WaitingText({
  state,
  status,
  neverUsed,
  unreadable,
}: {
  state: SourceState
  status: SourceStatus | undefined
  neverUsed: boolean
  unreadable: number
}) {
  if (state === 'ok') {
    const unread =
      status && status.unrecognised > 0
        ? ` ${status.unrecognised} of ${status.received} unread in the last 7 days.`
        : ''
    return (
      <p>
        {lastText(status)}
        {unread}
      </p>
    )
  }
  if (state === 'quiet') {
    return (
      <p>
        {lastText(status)} Nothing since. That may only mean no card payments; if you did pay, check the shortcut. This
        is information only.
      </p>
    )
  }
  if (state === 'unrecognised') {
    return (
      <p>
        Notifications are reaching the app ({status?.received} in the last 7 days) but none was read as a payment: none
        showed an amount with its currency, or you muted its wording. The shortcut may also send the wrong fields.{' '}
        {lastText(status)}
      </p>
    )
  }
  // Requests that could not be read did reach the app, so "nothing has reached it" would be wrong.
  if (unreadable > 0) return null
  return (
    <p>
      Nothing has reached the app yet. Pay with your card; a small amount will do.
      {neverUsed ? ' Your key has not been used yet.' : ''}
    </p>
  )
}

export function Waiting({
  setup,
}: {
  setup: Pick<ReturnType<typeof useCaptureSetup>, 'status' | 'keys' | 'recheck' | 'error'>
}) {
  // A read that has not landed, or failed, says nothing about the phone: the card shows the error line, never a claim.
  if (setup.error) return null
  if (!setup.status) {
    return (
      <div className={styles.step} aria-live="polite">
        <span className={styles.stepTitle}>Checking</span>
      </div>
    )
  }
  const status = overall(setup.status.sources)
  const state = sourceState(status, new Date())
  const neverUsed = setup.keys !== null && setup.keys.length > 0 && setup.keys.every((k) => !k.lastUsedAt)
  return (
    <div className={`${styles.step} ${styles[state]}`} aria-live="polite">
      <span className={styles.stepTitle}>{WAITING_TITLE[state]}</span>
      <div className={styles.stepBody}>
        <WaitingText state={state} status={status} neverUsed={neverUsed} unreadable={setup.status.malformed} />
        <Unreadable count={setup.status.malformed} />
        <button type="button" className={styles.copy} onClick={setup.recheck}>
          Check again
        </button>
      </div>
    </div>
  )
}
