import { EXIT_MS } from '../hooks/motion'
import { ConfirmSheet } from './ConfirmSheet'
import { Presence } from './Presence'
import type { useDraftGuards } from './transactionModalState'
import styles from './TransactionModal.module.css'

export function ModeToggle({
  mode,
  onChange,
}: {
  mode: 'single' | 'batch'
  onChange: (mode: 'single' | 'batch') => void
}) {
  return (
    <div className={styles.modeToggle} role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'single'}
        className={`${styles.modeBtn} ${mode === 'single' ? styles.modeActive : ''}`}
        onClick={() => onChange('single')}
      >
        Add one
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'batch'}
        className={`${styles.modeBtn} ${mode === 'batch' ? styles.modeActive : ''}`}
        onClick={() => onChange('batch')}
      >
        Add multiple
      </button>
    </div>
  )
}

/**
 * Closing with work at risk. Which work depends on whether the row saved: past a
 * partial save the transaction is safe and only its receipts are stranded, so
 * "you'll lose what you've entered" is both wrong and frightening about the
 * wrong thing.
 */
function CloseConfirm({
  stranded,
  onConfirm,
  onCancel,
}: {
  stranded: number
  onConfirm: () => void
  onCancel: () => void
}) {
  const saved = stranded > 0
  const noun = stranded === 1 ? 'receipt' : 'receipts'
  return (
    <ConfirmSheet
      title={saved ? 'Leave without the receipts?' : 'Discard unsaved changes?'}
      message={
        saved
          ? `The transaction is saved. The ${stranded} ${noun} that failed to upload will be discarded — you can attach them later from the transaction.`
          : "Closing now will lose what you've entered."
      }
      confirmLabel={saved ? 'Leave' : 'Discard'}
      destructive
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}

/** The two ways out of this modal that need confirming, kept together. */
export function ModalGuards({
  guards,
  onClose,
  onKeepOtherDraft,
}: {
  guards: ReturnType<typeof useDraftGuards>
  onClose: () => void
  onKeepOtherDraft: () => void
}) {
  const { confirming, discardingOther, stranded, cancel } = guards
  return (
    <>
      <Presence show={confirming} exitMs={EXIT_MS.sheet}>
        <CloseConfirm stranded={stranded} onConfirm={onClose} onCancel={cancel} />
      </Presence>
      <Presence show={discardingOther && !confirming} exitMs={EXIT_MS.sheet}>
        <ConfirmSheet
          title="Discard the other draft?"
          message="Your transactions were added. The single transaction you started on the other tab has not been saved."
          confirmLabel="Discard it"
          destructive
          onConfirm={onClose}
          onCancel={onKeepOtherDraft}
        />
      </Presence>
    </>
  )
}
