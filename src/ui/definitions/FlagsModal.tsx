import { useState } from 'react'
import type { Flag } from '../../types'
import { buildFlagGroup } from '../../domain/engine/flagGroups'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { EmptyState } from '../components/primitives'
import { Modal } from '../components/Modal'
import { FlagGlyph } from '../components/FlagGlyph'
import { ChevronIcon } from '../icons'
import { FlagForm } from './FlagForm'
import { FlagAutoLabelEditor } from './FlagAutoLabelEditor'
import { transactionCountLabel } from '../components/flagPickerOptions'
import { useRecordUsage } from './recordUsage'
import defStyles from './definitions.module.css'
import styles from './FlagsModal.module.css'

type Editing = { flag: Flag } | { flag: null } | null

/**
 * Whether a report would actually build. A raw usage count is not the same
 * question: it counts cancelled rows and mis-typed income that `buildFlagGroup`
 * drops, so a flag carrying only those offered a button that opened nothing.
 */
function hasReport(model: ExpenseModel, flag: Flag): boolean {
  if (!flag.reimbursable) return false
  return buildFlagGroup(flag.id, model.dataset.transactions, model.dataset.flags) != null
}

export function FlagsModal({
  model,
  actions,
  onClose,
  onOpenReport,
}: {
  model: ExpenseModel
  actions: ExpenseActions
  onClose: () => void
  /**
   * Opens a flag's expense report. The only route to an archived flag's:
   * archiving is how a claim is marked done, it drops out of the Flagged card
   * by design, and a done claim is exactly the one an employer asks to see
   * again. Closes this modal first — the two render as siblings, so leaving
   * both mounted would leave this one's focus trap live under the sheet.
   */
  onOpenReport?: ((flagId: number) => void) | undefined
}) {
  const [editing, setEditing] = useState<Editing>(null)
  const [confirming, setConfirming] = useState(false)
  const [configuringLabel, setConfiguringLabel] = useState<Flag | null>(null)
  const flags = model.dataset.flags
  const usage = useRecordUsage(model)

  const title = editing
    ? editing.flag
      ? `Edit ${editing.flag.name}`
      : 'New flag'
    : configuringLabel
      ? `Auto-label: ${configuringLabel.name}`
      : 'Flags'

  return (
    <Modal
      title={title}
      {...(editing || configuringLabel
        ? {}
        : { subtitle: 'Reusable markers for transactions you need to track.' })}
      onClose={confirming ? () => setConfirming(false) : onClose}
      trapPaused={confirming}
    >
      {editing ? (
        <FlagForm
          flag={editing.flag}
          existing={flags}
          usageCount={editing.flag ? usage.count('flag', editing.flag.id) : 0}
          actions={actions}
          onDone={() => setEditing(null)}
          onConfirmingChange={setConfirming}
        />
      ) : configuringLabel ? (
        <FlagAutoLabelEditor
          flag={configuringLabel}
          labels={model.dataset.labels}
          actions={actions}
          onDone={() => setConfiguringLabel(null)}
        />
      ) : (
        <>
          {flags.length === 0 ? (
            <EmptyState>
              No flags yet. Create one to group transactions you need to follow up on — expenses to
              claim back, say.
            </EmptyState>
          ) : (
            flags.map((flag) => (
              <div
                key={flag.id}
                className={flag.active ? styles.row : `${styles.row} ${styles.inactive}`}
              >
                <button
                  type="button"
                  className={styles.rowMain}
                  onClick={() => setConfiguringLabel(flag)}
                >
                  <FlagGlyph flag={flag} className={styles.rowGlyph} />
                  <div className={styles.rowBody}>
                    <span className={styles.rowName}>
                      {flag.name}
                      {flag.active ? null : <span className={styles.archived}> · archived</span>}
                    </span>
                    <span className={styles.rowMeta}>
                      {flag.description ? `${flag.description} · ` : ''}
                      {usage.count('flag', flag.id) === null ? '—' : transactionCountLabel(usage.count('flag', flag.id))}
                    </span>
                  </div>
                  <ChevronIcon className={styles.rowChevron} aria-hidden="true" />
                </button>
                {onOpenReport && hasReport(model, flag) ? (
                  <button
                    type="button"
                    className={defStyles.editBtn}
                    onClick={() => {
                      onClose()
                      onOpenReport(flag.id)
                    }}
                  >
                    Expense report
                  </button>
                ) : null}
                <button
                  type="button"
                  className={defStyles.editBtn}
                  onClick={() => setEditing({ flag })}
                >
                  Edit
                </button>
              </div>
            ))
          )}
          {usage.notice}
          <button
            type="button"
            className={defStyles.addBtn}
            onClick={() => setEditing({ flag: null })}
          >
            + Add flag
          </button>
        </>
      )}
    </Modal>
  )
}
