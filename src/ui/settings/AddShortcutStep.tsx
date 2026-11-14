import { useId } from 'react'
import styles from './CaptureSetupSetting.module.css'

/**
 * Downloads the generic Shortcut file the app serves behind the sign-in. An ordinary link with the `download` hint, so
 * the browser saves the bytes and the app never fetches them. The sentence under it says what happens, and the link
 * points at it, so a screen reader announces that it is a file download before the person follows it.
 */
export function AddShortcutLink() {
  const hint = useId()
  return (
    <>
      <a
        className={styles.linkButton}
        href="/api/capture-shortcut"
        download="Expense capture.shortcut"
        aria-describedby={hint}
      >
        Add the shortcut
      </a>
      <p id={hint}>
        This downloads a file called Expense capture. Open it from your downloads; iOS should offer to open it in
        Shortcuts, where you add it. The next three steps are edits you make inside it. The address it posts to is
        already in it. Not tried: this download from the installed Home Screen app.
      </p>
    </>
  )
}
