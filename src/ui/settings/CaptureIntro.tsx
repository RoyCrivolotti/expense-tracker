import { useEffect } from 'react'
import { TIP_IDS } from '../../domain/onboarding/tips'
import { TipCard } from '../tips/TipCard'
import { TipLink } from '../tips/TipLink'
import { useTips } from '../tips/tipsContext'
import styles from './CaptureIntro.module.css'
import type { Setup } from './SetupStep'

/**
 * First visit to Capture by a person with no key: what it is, what it needs and costs, and that it is optional. Held back
 * until the keys and the status have been read, because "no key yet" is not known before and the steps it points to are
 * not drawn before. Once a key exists the person has started, so the card is put away for good (revoking the key later
 * does not bring it back). "Start setup" opens the steps and takes the focus to them; "Not now" only puts the card away.
 */
export function CaptureIntro({ setup, onStart }: { setup: Pick<Setup, 'keys' | 'status'>; onStart: () => void }) {
  const { isShown, dismiss } = useTips()
  const noKey = setup.status !== null && setup.keys !== null && setup.keys.length === 0
  const hasKey = setup.keys !== null && setup.keys.length > 0
  useEffect(() => {
    if (hasKey && isShown(TIP_IDS.capture)) dismiss(TIP_IDS.capture)
  }, [hasKey, isShown, dismiss])
  return (
    <TipCard
      id={TIP_IDS.capture}
      title="Capture (optional)"
      actionLabel="Start setup"
      onAction={onStart}
      when={noKey}
      secondary={<TipLink>Not now</TipLink>}
    >
      <ul className={styles.list}>
        <li>Turns your bank app&rsquo;s payment notifications into payments to confirm with a tap.</li>
        <li>Needs an iPhone or iPad with the Shortcuts app, tested on iOS 27.</li>
        <li>Takes about ten minutes, once per device.</li>
        <li>Adding payments by hand always works without it.</li>
      </ul>
    </TipCard>
  )
}
