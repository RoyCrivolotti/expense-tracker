import { useState } from 'react'
import { captureEnabled, setCaptureFlag } from '../../config/captureFlag'
import tabStyles from '../tabs/tabs.module.css'
import styles from './AppVersionSetting.module.css'

/** Leaves the address without its query, so a `?capture=` left in it cannot undo the choice on the next load. */
function reloadWithoutQuery(): void {
  window.location.replace(window.location.pathname + window.location.hash)
}

/**
 * Shows or hides the bank-notification screens in this browser or installed app. An installed Home Screen app keeps its
 * own storage and has no address bar, so it cannot take `?capture=on`. The screens read the flag once when they mount,
 * so the change reloads the app.
 */
export function CaptureSwitch({ reload = reloadWithoutQuery }: { reload?: () => void }) {
  const [on, setOn] = useState(captureEnabled)
  const [refused, setRefused] = useState(false)
  const change = (next: boolean) => {
    let storage: Storage | null = null
    try {
      storage = window.localStorage
    } catch {
      // Storage itself throws in some privacy modes.
    }
    if (!setCaptureFlag(next, storage)) return setRefused(true)
    setOn(next)
    reload()
  }
  return (
    <div className={styles.row}>
      <dt>Capture screens (beta)</dt>
      <dd>
        <label>
          <input type="checkbox" checked={on} onChange={(e) => change(e.target.checked)} /> {on ? 'On' : 'Off'}
        </label>
        <p className={tabStyles.settingHint}>
          Shows the screens that turn bank notifications into payments to review. This browser or app only. Changing it
          reloads the app.
        </p>
        {refused ? (
          <p className={tabStyles.settingError} role="alert">
            This browser would not keep the choice.
          </p>
        ) : null}
      </dd>
    </div>
  )
}
