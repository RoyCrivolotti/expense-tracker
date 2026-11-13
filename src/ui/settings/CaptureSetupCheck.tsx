import type { SourceStatus } from '../../data/captureStatusApi'
import { lastCaptureText, sourceState, type SourceState } from './captureSetup'
import styles from './CaptureSetupSetting.module.css'
import type { useCaptureSetup } from './useCaptureSetup'

const WAITING_TITLE: Record<SourceState, string> = {
  ok: 'Last payment captured',
  quiet: 'Nothing captured lately',
  unrecognised: 'Arriving, not read as a payment',
  waiting: 'Waiting for your first payment',
}

function lastText(iberia: SourceStatus | undefined): string {
  return iberia?.lastCaptureAt
    ? `Iberia: last payment captured ${lastCaptureText(iberia.lastCaptureAt, new Date())}.`
    : ''
}

function WaitingText({
  state,
  iberia,
  neverUsed,
}: {
  state: SourceState
  iberia: SourceStatus | undefined
  neverUsed: boolean
}) {
  if (state === 'ok') return <p>{lastText(iberia)}</p>
  if (state === 'quiet') {
    return (
      <p>
        {lastText(iberia)} Nothing since. That may only mean no card payments; if you did pay, check the shortcut. This
        is information only.
      </p>
    )
  }
  if (state === 'unrecognised') {
    return (
      <p>
        Notifications are reaching the app ({iberia?.received} in the last 7 days) but none was read as a payment. The
        bank may have reworded its message, or the shortcut sends the wrong fields. {lastText(iberia)}
      </p>
    )
  }
  return (
    <p>
      Nothing has reached the app yet. Pay with your card; a small amount will do.
      {neverUsed ? ' Your key has not been used yet.' : ''}
    </p>
  )
}

export function Waiting({ setup }: { setup: Pick<ReturnType<typeof useCaptureSetup>, 'status' | 'keys' | 'recheck'> }) {
  const iberia = setup.status?.sources.find((s) => s.source === 'iberia')
  const state = sourceState(iberia, new Date())
  const neverUsed = setup.keys !== null && setup.keys.length > 0 && setup.keys.every((k) => !k.lastUsedAt)
  return (
    <li className={`${styles.step} ${styles[state]}`} aria-live="polite">
      <span className={styles.stepTitle}>{WAITING_TITLE[state]}</span>
      <div className={styles.stepBody}>
        <WaitingText state={state} iberia={iberia} neverUsed={neverUsed} />
        <button type="button" className={styles.copy} onClick={setup.recheck}>
          Check again
        </button>
      </div>
    </li>
  )
}
