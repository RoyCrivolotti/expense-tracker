import { useId } from 'react'
import styles from './CaptureSetupSetting.module.css'

/**
 * Opens the shared Shortcut in Shortcuts. An ordinary link that opens in its own tab and is never fetched, so the app
 * reads nothing from iCloud and sends nothing to it. The sentence under it says where the link goes, and the link
 * points at it, so a screen reader announces that before the person follows it.
 */
export function AddShortcutLink({ url }: { url: string }) {
  const hint = useId()
  return (
    <>
      <a className={styles.linkButton} href={url} target="_blank" rel="noopener noreferrer" aria-describedby={hint}>
        Add the shortcut
      </a>
      <p id={hint}>
        This opens the shortcut in Shortcuts, in a new tab. Add it there. The next three steps are edits you make inside
        it. The address it posts to is already in it.
      </p>
    </>
  )
}
