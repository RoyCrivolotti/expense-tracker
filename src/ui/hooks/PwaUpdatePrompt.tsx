import { useRegisterSW } from 'virtual:pwa-register/react'
import styles from './PwaUpdatePrompt.module.css'

/** Prompt to reload when a new service worker is waiting (production PWA only). */
export function PwaUpdatePrompt() {
  const { needRefresh, updateServiceWorker } = useRegisterSW()
  const [showRefresh] = needRefresh

  if (!import.meta.env.PROD || !showRefresh) return null

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <span className={styles.message}>Update available</span>
      <button type="button" className={styles.reloadBtn} onClick={() => void updateServiceWorker(true)}>
        Reload
      </button>
    </div>
  )
}
