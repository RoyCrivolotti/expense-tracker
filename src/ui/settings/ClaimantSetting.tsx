import { useState } from 'react'
import type { ExpenseSettings } from '../../types'
import { Card, SectionTitle } from '../components/primitives'
import styles from '../tabs/tabs.module.css'

/** Long enough for any real name; short enough to fit the printed header. */
const CLAIMANT_NAME_MAX_LENGTH = 80

interface Props {
  settings: ExpenseSettings
  onChange: (patch: Partial<ExpenseSettings>) => void | Promise<void>
}

/**
 * The name printed on a claim.
 *
 * Its own section rather than a line in "Money & months", which is about
 * formatting. Deliberately not derived from the Cloudflare Access email: that
 * identifies the account, not the person, and an address on an expense form
 * reads as a mistake to whoever approves it.
 */
export function ClaimantSetting({ settings, onChange }: Props) {
  // Local state committed on blur, the same shape MilestonesSetting uses.
  // Bound straight to server state it fired a PUT per keystroke: typing
  // "Alex Moreno" issued eleven, each resolving into a full settings replace,
  // so an out-of-order response snapped the field back mid-word and moved the
  // caret to the end.
  const [draft, setDraft] = useState(settings.claimantName)
  // Adjusted during render rather than in an effect: React documents this as
  // the way to reset state when a prop changes, and it avoids the extra commit
  // (and the cascading-render lint rule) an effect would cost.
  const [lastSaved, setLastSaved] = useState(settings.claimantName)
  if (settings.claimantName !== lastSaved) {
    setLastSaved(settings.claimantName)
    setDraft(settings.claimantName)
  }

  const commit = () => {
    const next = draft.trim()
    if (next === settings.claimantName) return
    void onChange({ claimantName: next })
  }

  return (
    <>
      <SectionTitle>Claims</SectionTitle>
      <Card>
        <div className={styles.settingGroup}>
          <label className={styles.defaultAccountField}>
            <span className={styles.defaultAccountLabel}>Claimant name</span>
            <input
              className={styles.defaultAccountSelect}
              type="text"
              autoComplete="name"
              maxLength={CLAIMANT_NAME_MAX_LENGTH}
              placeholder="e.g. Alex Moreno"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
            />
          </label>
          <p className={styles.settingHint}>
            Printed at the top of a claim. Leave it empty and the claim omits the claimant line.
          </p>
        </div>
      </Card>
    </>
  )
}
