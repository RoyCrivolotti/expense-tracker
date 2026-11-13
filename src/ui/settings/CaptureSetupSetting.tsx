import { useState } from 'react'
import { Card, SectionTitle } from '../components/primitives'
import tabStyles from '../tabs/tabs.module.css'
import { pastedEndpoint } from './captureSetup'
import { AddShortcutStep } from './AddShortcutStep'
import { Waiting } from './CaptureSetupCheck'
import styles from './CaptureSetupSetting.module.css'
import { Step, type Setup } from './SetupStep'
import { useCaptureSetup } from './useCaptureSetup'

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
    <>
      <button type="button" className={styles.copy} aria-label={label} onClick={() => void copy()}>
        {done === 'copied' ? 'Copied' : done === 'failed' ? 'Copy failed, select it' : 'Copy'}
      </button>
      {/* The button's name stays the same, so the result is said from here. */}
      <span role="status" className={styles.srOnly}>
        {done === 'copied' ? 'Copied' : done === 'failed' ? 'Copy failed, select the text and copy it by hand' : ''}
      </span>
    </>
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
        The app does not know the address of the capture Worker. Paste it here, in the form
        https://capture.example.workers.dev (https only; the app adds /capture). It is kept in this browser.
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

function KeyStep({ setup, shortcut }: { setup: Setup; shortcut: boolean }) {
  return (
    <li className={styles.step}>
      <span className={styles.stepTitle}>
        2. Make a key{shortcut ? ' and copy it' : ''}
        {setup.keys && setup.keys.length > 0 ? ' (done)' : ''}
      </span>
      <div className={styles.stepBody}>
        <p>
          Name it after your phone and make it in Capture key below.{' '}
          {shortcut
            ? 'Tap Copy as soon as it appears: it is shown once, and you paste it into Shortcuts in the next step.'
            : 'It is shown once; copy it.'}
        </p>
      </div>
    </li>
  )
}

function ManualBuild({ setup }: { setup: Setup }) {
  return (
    <>
      <Step id="build" title="3. Build the shortcut" setup={setup}>
        <p>
          Add the trigger When I receive a notification from, and pick the app: IberiaCards for the Icon card (one word,
          as it appears in the notification). Leave the filters empty. Add Get Contents of URL, tap Show More, set
          Method to POST and Request Body to JSON, then add four fields: source (typed text, iberia), title and body
          (the notification's Title and Body), and date (the notification's Date). In saved notes the date arrived as
          ISO 8601 with the phone's offset, so try that date format; the app reads that form. Optional: an If that
          checks the answer contains ok, and otherwise shows a notification, Capture failed.
        </p>
      </Step>
      <Step id="point" title="4. Point it at the app" setup={setup}>
        <p>URL, exactly as shown:</p>
        <Address setup={setup} />
        <p>Header Authorization with the value Bearer, a space, then your key.</p>
      </Step>
    </>
  )
}

function Steps({ setup }: { setup: Setup }) {
  // Until the status has been read nobody knows which way the card goes, so the shortcut steps wait for it.
  const loaded = setup.status !== null || setup.error !== null
  const link = setup.status?.shortcutUrl ?? null
  const last = link ? 3 : 4
  return (
    <ol className={styles.steps}>
      <Step id="ios" title="1. Check your iPhone" setup={setup}>
        <p>
          The trigger this uses was seen on iOS 27. We have not tried an older iPhone or Android. This screen cannot
          tell your version; check Settings, General, About.
        </p>
      </Step>
      <KeyStep setup={setup} shortcut={link !== null} />
      {loaded && link ? <AddShortcutStep setup={setup} url={link} /> : null}
      {loaded && !link ? <ManualBuild setup={setup} /> : null}
      {loaded ? (
        <>
          <Step id="run" title={`${last + 1}. Run it automatically`} setup={setup}>
            <p>
              {link ? 'A shared shortcut can arrive with its automation switched off. ' : ''}Keep Automation on. Notify
              was off on the automations that were tried, and whether it matters is untried. Turn on Allow Running When
              Locked (info button, Privacy). The editor can say Automation is turned off while it runs, so trust the
              automation list and your first real payment.
            </p>
          </Step>
          <Step id="allow" title={`${last + 2}. If iOS keeps asking`} setup={setup}>
            <p>
              If iOS asks whether the shortcut may send data to that address, allow it and choose the option that
              remembers the answer. If it asks again on every payment, an unattended run cannot work yet. That is
              untested, so tell us.
            </p>
          </Step>
        </>
      ) : null}
      <Waiting setup={setup} />
    </ol>
  )
}

const BY_HAND =
  'A shortcut built by hand from these steps worked on one phone. It has not been tried on a second phone.'
const FROM_LINK =
  'The shortcut was installed from a shared copy on one phone and worked. It has not been tried from the installed Home Screen app or on a second phone.'

/** Six steps to get Iberia notifications into the app, and a live check that the first one arrived. */
export function CaptureSetupSetting() {
  const setup = useCaptureSetup()
  return (
    <>
      <SectionTitle>Set up capture</SectionTitle>
      <Card>
        <div className={tabStyles.settingGroup}>
          <p className={tabStyles.settingHint}>
            Capture sends each Iberia card notification from your iPhone to the app, which turns it into a payment for
            you to review. {setup.status?.shortcutUrl ? FROM_LINK : BY_HAND}
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
