import { useState } from 'react'
import { Card, SectionTitle } from '../components/primitives'
import { ConfirmSheet } from '../components/ConfirmSheet'
import { shortDayLabel } from '../format'
import tabStyles from '../tabs/tabs.module.css'
import type { CaptureKeyInfo } from '../../data/captureKeysApi'
import styles from './CaptureKeySetting.module.css'
import { useCaptureKeys } from './useCaptureKeys'

const MAX_LABEL_LENGTH = 40

function usedText(key: CaptureKeyInfo): string {
  const made = `Made ${shortDayLabel(key.createdAt.slice(0, 10))}`
  return key.lastUsedAt ? `${made} · last used ${shortDayLabel(key.lastUsedAt.slice(0, 10))}` : `${made} · never used`
}

/** Copies the key and says so; a browser that refuses leaves the key selected for a manual copy. */
function CopyKey({ value }: { value: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setState('copied')
    } catch {
      setState('failed')
    }
  }
  return (
    <button type="button" className={styles.copy} onClick={() => void copy()}>
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed, select it' : 'Copy'}
    </button>
  )
}

function FreshKey({ value, onDone }: { value: string; onDone: () => void }) {
  return (
    <div className={styles.fresh} role="status">
      <p className={styles.freshTitle}>Your new key. It will not be shown again.</p>
      <code className={styles.keyText}>{value}</code>
      <div className={styles.freshActions}>
        <CopyKey value={value} />
        <button type="button" className={styles.quiet} onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  )
}

function MakeKeyForm({ busy, onMake }: { busy: boolean; onMake: (label: string) => Promise<boolean> }) {
  const [label, setLabel] = useState('')
  return (
    <form
      className={styles.make}
      onSubmit={(e) => {
        e.preventDefault()
        void onMake(label).then((made) => made && setLabel(''))
      }}
    >
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Name</span>
        <input
          className={styles.input}
          type="text"
          maxLength={MAX_LABEL_LENGTH}
          placeholder="e.g. My iPhone"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>
      <button type="submit" className={styles.primary} disabled={busy}>
        Make a key
      </button>
    </form>
  )
}

function KeyList({ keys, busy, onRevoke }: { keys: CaptureKeyInfo[]; busy: boolean; onRevoke: (key: CaptureKeyInfo) => void }) {
  if (keys.length === 0) return <p className={tabStyles.settingHint}>No keys yet.</p>
  return (
    <ul className={styles.list}>
      {keys.map((key) => (
        <li key={key.keyId} className={styles.row}>
          <span className={styles.name}>
            <span className={styles.label}>{key.label}</span>
            <span className={styles.meta}>{usedText(key)}</span>
          </span>
          <button
            type="button"
            className={styles.revoke}
            disabled={busy}
            aria-label={`Revoke ${key.label}`}
            onClick={() => onRevoke(key)}
          >
            Revoke
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * The keys a phone's Shortcut sends with each bank push. A key is made here, shown once, and kept only as a hash,
 * so one that is lost is replaced and not recovered.
 */
export function CaptureKeySetting() {
  const { keys, fresh, error, busy, create, revoke, dismissFresh } = useCaptureKeys()
  const [revoking, setRevoking] = useState<CaptureKeyInfo | null>(null)

  return (
    <>
      <SectionTitle>Capture key</SectionTitle>
      <Card>
        <div className={tabStyles.settingGroup}>
          <p className={tabStyles.settingHint}>
            Your Shortcut sends each bank notification with a key that only you can make. Name it after the phone, make
            it here, and paste it into the Shortcut. It is shown once.
          </p>
          {fresh ? <FreshKey value={fresh.key} onDone={dismissFresh} /> : null}
          <MakeKeyForm busy={busy} onMake={create} />
          {error ? (
            <p className={tabStyles.settingError} role="alert">
              {error}
            </p>
          ) : null}
          {keys ? <KeyList keys={keys} busy={busy} onRevoke={setRevoking} /> : null}
        </div>
      </Card>
      {revoking ? (
        <ConfirmSheet
          title={`Revoke ${revoking.label}?`}
          message="The Shortcut using this key stops working at once. Make a new key and paste it in to carry on."
          confirmLabel="Revoke"
          destructive
          onCancel={() => setRevoking(null)}
          onConfirm={() => {
            const target = revoking
            setRevoking(null)
            void revoke(target.keyId)
          }}
        />
      ) : null}
    </>
  )
}
