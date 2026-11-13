import styles from './CaptureSetupSetting.module.css'
import { Step, type Setup } from './SetupStep'

/**
 * Opens the shared Shortcut in Shortcuts, which asks for the person's capture key. An ordinary link that opens in its
 * own tab and is never fetched, so the app reads nothing from iCloud and sends nothing to it.
 */
export function AddShortcutStep({ setup, url }: { setup: Setup; url: string }) {
  return (
    <Step id="add" title="3. Add the shortcut" setup={setup}>
      <a className={styles.linkButton} href={url} target="_blank" rel="noopener noreferrer">
        Add the shortcut
      </a>
      <p>
        Shortcuts opens and asks for your capture key. Paste the key you copied. The shortcut then sends each Iberia
        notification to the app.
      </p>
    </Step>
  )
}
