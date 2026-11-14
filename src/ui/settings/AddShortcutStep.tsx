import { useId } from 'react'
import styles from './CaptureSetupSetting.module.css'

/**
 * Downloads the generic Shortcut file the app serves behind the sign-in. The app never fetches the bytes. The link opens
 * a new context (`_blank`) and has no `download` attribute: in the installed Home Screen app a same-window link replaces
 * the whole app with iOS's file preview, which has no back button, whereas a new context gets its own Done button. The
 * filename comes from the response's `Content-Disposition`. The sentence under the link says what happens, and the link
 * points at it, so a screen reader announces that it is a file download before the person follows it.
 */
export function AddShortcutLink() {
  const hint = useId()
  return (
    <>
      <a
        className={styles.linkButton}
        href="/api/capture-shortcut"
        target="_blank"
        rel="noopener"
        aria-describedby={hint}
      >
        Add the shortcut
      </a>
      <p id={hint}>
        This downloads a file called Expense capture. Open it from your downloads and add it in Shortcuts. Opening it
        there is not tried yet, and neither is this download from the installed Home Screen app. The next three steps
        are edits you make inside it. The address it posts to is already in it.
      </p>
    </>
  )
}
