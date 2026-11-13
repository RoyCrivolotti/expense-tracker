import { useState, type ReactNode } from 'react'
import { Card, SectionTitle } from '../components/primitives'
import tabStyles from '../tabs/tabs.module.css'
import type { SourceStatus } from '../../data/captureStatusApi'
import { lastCaptureText, pastedEndpoint, sourceState, type SourceState } from './captureSetup'
import styles from './CaptureSetupSetting.module.css'
import { useCaptureSetup } from './useCaptureSetup'

type Setup = ReturnType<typeof useCaptureSetup>

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setDone('copied')
    } catch {
      setDone('failed')
    }
  }
  return (
    <button type="button" className={styles.copy} aria-label={label} onClick={() => void copy()}>
      {done === 'copied' ? 'Copied' : done === 'failed' ? 'Copy failed, select it' : 'Copy'}
    </button>
  )
}

/** A step the person confirms themselves: the app cannot see their phone. */
function Step({ id, title, setup, children }: { id: string; title: string; setup: Setup; children: ReactNode }) {
  const done = setup.ticks.has(id)
  return (
    <li className={styles.step}>
      <label className={styles.stepHead}>
        <input type="checkbox" checked={done} onChange={(e) => setup.tick(id, e.target.checked)} />
        <span className={styles.stepTitle}>{title}</span>
      </label>
      <div className={styles.stepBody}>{children}</div>
    </li>
  )
}

function Address({ setup }: { setup: Setup }) {
  if (setup.endpoint) {
    return (
      <div className={styles.address}>
        <code className={styles.code}>{setup.endpoint}</code>
        <Copy text={setup.endpoint} label="Copy the address" />
      </div>
    )
  }
  return (
    <label className={styles.paste}>
      <span>
        The app does not know the address of the capture Worker. Paste it here (https only). It is kept in this browser.
      </span>
      <input
        className={styles.input}
        type="url"
        inputMode="url"
        placeholder="https://capture.example.workers.dev"
        value={setup.pasted}
        onChange={(e) => setup.paste(e.target.value)}
      />
      {setup.pasted && !pastedEndpoint(setup.pasted) ? (
        <span className={styles.warn}>That is not an https address.</span>
      ) : null}
    </label>
  )
}

const WAITING_TITLE: Record<SourceState, string> = {
  ok: 'Working',
  unrecognised: 'Arriving, not read as a payment',
  waiting: 'Waiting for your first payment',
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
  if (state === 'ok' && iberia?.lastCaptureAt)
    return <p>Iberia: last capture {lastCaptureText(iberia.lastCaptureAt, new Date())}.</p>
  if (state === 'unrecognised') {
    return (
      <p>
        Notifications are reaching the app ({iberia?.received} in the last 7 days) but none was read as a payment. The
        bank may have reworded its message, or the shortcut sends the wrong fields.
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

function Waiting({ setup }: { setup: Setup }) {
  const iberia = setup.status?.sources.find((s) => s.source === 'iberia')
  const state = sourceState(iberia)
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

function Steps({ setup }: { setup: Setup }) {
  return (
    <ol className={styles.steps}>
      <Step id="ios" title="1. Check your iPhone" setup={setup}>
        <p>
          This needs an iPhone on iOS 27 or later. On Android or an older iPhone the automation cannot be built. This
          screen cannot tell your version; check Settings, General, About.
        </p>
      </Step>
      <li className={styles.step}>
        <span className={styles.stepTitle}>2. Make a key{setup.keys && setup.keys.length > 0 ? ' (done)' : ''}</span>
        <div className={styles.stepBody}>
          <p>Name it after your phone and make it in Capture key below. It is shown once; copy it.</p>
        </div>
      </li>
      <Step id="build" title="3. Build the shortcut" setup={setup}>
        <p>
          Add the trigger When I receive a notification from, and pick the app: IberiaCards for the Icon card (one word,
          as it appears in the notification). Leave the filters empty. Add Get Contents of URL, tap Show More, set
          Method to POST and Request Body to JSON, then add four fields: source (typed text, iberia), title and body
          (the notification's Title and Body), and date (the notification's Date, in ISO 8601 with the phone's offset).
          Optional: an If that checks the answer contains ok, and otherwise shows a notification, Capture failed.
        </p>
      </Step>
      <Step id="point" title="4. Point it at the app" setup={setup}>
        <p>URL, exactly as shown:</p>
        <Address setup={setup} />
        <p>Header Authorization with the value Bearer, a space, then your key.</p>
      </Step>
      <Step id="run" title="5. Run it automatically" setup={setup}>
        <p>
          Keep Automation on. Notify can stay off. Turn on Allow Running When Locked (info button, Privacy). The editor
          can say Automation is turned off while it runs, so trust the automation list and your first real payment.
        </p>
      </Step>
      <Step id="allow" title="6. If iOS keeps asking" setup={setup}>
        <p>
          If iOS asks whether the shortcut may send data to that address, allow it and choose the option that remembers
          the answer. If it asks again on every payment, an unattended run cannot work yet. That is untested, so tell
          us.
        </p>
      </Step>
      <Waiting setup={setup} />
    </ol>
  )
}

const SECOND_PHONE =
  'These steps come from research and from a shortcut that works on one phone. They have not yet been proven end to end on a second phone.'

/** Seven steps to get Iberia notifications into the app, and a live check that the first one arrived. */
export function CaptureSetupSetting() {
  const setup = useCaptureSetup()
  return (
    <>
      <SectionTitle>Set up capture</SectionTitle>
      <Card>
        <div className={tabStyles.settingGroup}>
          <p className={tabStyles.settingHint}>
            Capture sends each Iberia card notification from your iPhone to the app, which turns it into a payment for
            you to review. {SECOND_PHONE}
          </p>
          {setup.error ? (
            <p className={tabStyles.settingError} role="alert">
              {setup.error}
            </p>
          ) : null}
          <Steps setup={setup} />
        </div>
      </Card>
    </>
  )
}
