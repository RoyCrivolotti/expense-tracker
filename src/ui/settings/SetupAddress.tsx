import { useState } from 'react'
import { pastedEndpoint } from './captureSetup'
import styles from './CaptureSetupSetting.module.css'
import type { Setup } from './SetupStep'

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

export function Address({ setup }: { setup: Setup }) {
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
