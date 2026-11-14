import type { ReactNode } from 'react'
import styles from './CaptureSetupSetting.module.css'
import type { useCaptureSetup } from './useCaptureSetup'

export type Setup = ReturnType<typeof useCaptureSetup>

/** A step the person confirms themselves: the app cannot see their phone. */
export function Step({ id, title, setup, children }: { id: string; title: string; setup: Setup; children: ReactNode }) {
  const done = setup.ticks.has(id)
  return (
    <li className={styles.step}>
      <label className={styles.stepHead}>
        <input type="checkbox" checked={done} onChange={(e) => setup.tick(id, e.target.checked)} />
        <span className={styles.stepTitle}>{title}</span>
      </label>
      <div className={styles.stepBody}>{children}</div>
    </li>
  )
}
