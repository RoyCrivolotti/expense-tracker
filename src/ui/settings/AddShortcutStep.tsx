import styles from './CaptureSetupSetting.module.css'

/**
 * Opens the shared Shortcut in Shortcuts. An ordinary link that opens in its own tab and is never fetched, so the app
 * reads nothing from iCloud and sends nothing to it.
 */
export function AddShortcutLink({ url }: { url: string }) {
  return (
    <>
      <a className={styles.linkButton} href={url} target="_blank" rel="noopener noreferrer">
        Add the shortcut
      </a>
      <p>Shortcuts opens and shows the shortcut. Add it. The next three steps are edits you make inside it.</p>
    </>
  )
}
