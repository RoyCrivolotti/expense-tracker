import { useId } from 'react'
import styles from './CaptureSetupSetting.module.css'

/**
 * Opens the Shortcut's iCloud share link, which Shortcuts shows as its Add Shortcut page. A plain link in a new window:
 * a file download traps the installed Home Screen app in iOS's file preview, and a custom `shortcuts://` address is
 * not opened from it. The sentence under it says what happens, and the link points at it, so a screen reader hears
 * that it opens a new window before the person follows it.
 */
export function AddShortcutLink({ href }: { href: string }) {
  const hint = useId()
  return (
    <>
      <a className={styles.linkButton} href={href} target="_blank" rel="noopener noreferrer" aria-describedby={hint}>
        Add the shortcut
      </a>
      <p id={hint}>
        This opens Shortcuts&rsquo; Add Shortcut page in a new window. Add it there, then come back here. The next three
        steps are edits you make inside it. The address it posts to is already in it.
      </p>
    </>
  )
}
